import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertBillingBridgeSameOrg,
  createExternalDocument,
  listExternalDocuments,
  updateExternalDocument,
} from '../data/external-documents';
import {
  assertIssuanceEligible,
  findReusableRejectedDocument,
} from '../domain/assert-issuance-eligible';
import type { StatutoryInvoicingProvider } from '../domain/provider';
import { reconcileExternalAmounts } from '../domain/reconcile-external-amounts';
import {
  assertBillingEligibleForExternalRequest,
  assertBillingIsNotStatutoryIssuer,
  assertNotLocalStatutoryIssuance,
} from '../domain/separation';
import type { ExternalStatutoryDocument } from '../domain/types';
import { getStatutoryInvoicingProvider } from '../domain/unconfigured-provider';
import { SumitAmbiguousCreateError } from '../providers/sumit/sumit-statutory-provider';
import {
  requestExternalDocumentSchema,
  type RequestExternalDocumentInput,
} from '../validation/schemas';
import { assertStatutoryFeatureEnabled } from './assert-feature-enabled';
import { resolveStatutoryProviderForOrg } from './resolve-statutory-provider';

/**
 * Billing Record → user requests external statutory document → provider → store refs.
 * Does not change BillingRecord amounts; does not issue locally.
 *
 * Issuance lock: insert `in_flight` before provider call; never blind-retry create.
 */
export async function requestExternalStatutoryDocument(
  context: OrgContext,
  rawInput: RequestExternalDocumentInput,
  provider?: StatutoryInvoicingProvider,
): Promise<ExternalStatutoryDocument> {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  assertBillingIsNotStatutoryIssuer();

  let resolvedProvider = provider;
  if (!resolvedProvider) {
    const fromOrg = await resolveStatutoryProviderForOrg(context);
    resolvedProvider = fromOrg.isConfigured()
      ? fromOrg
      : getStatutoryInvoicingProvider();
  }
  assertStatutoryFeatureEnabled(resolvedProvider);
  assertNotLocalStatutoryIssuance(resolvedProvider.id);

  const input = requestExternalDocumentSchema.parse(rawInput);
  await assertBillingBridgeSameOrg(
    context,
    input.billing.billingRecordId,
    input.billing.organizationId,
  );
  assertBillingEligibleForExternalRequest(input.billing);

  const existing = await listExternalDocuments(context, input.billing.billingRecordId);
  assertIssuanceEligible(existing, input.kind);

  const reusable = findReusableRejectedDocument(existing, input.kind);
  const row = reusable
    ? (await updateExternalDocument(context, reusable.id, {
        status: 'requested',
        issuanceOutcome: 'in_flight',
        reconciliationStatus: 'pending',
        reconciliationMetadata: null,
        externalId: null,
        externalNumber: null,
        externalUrl: null,
        pdf: null,
        issuedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      }))!
    : await createExternalDocument(context, {
        billingRecordId: input.billing.billingRecordId,
        providerId: resolvedProvider.id,
        kind: input.kind,
        status: 'requested',
        issuanceOutcome: 'in_flight',
        idempotencyKey: input.idempotencyKey,
        reconciliationStatus: 'pending',
      });

  try {
    const result = await resolvedProvider.createDocument({
      organizationId: context.organizationId,
      billing: input.billing,
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
    });

    if (!result.ok) {
      const failed = await updateExternalDocument(context, row.id, {
        status: 'cancelled',
        issuanceOutcome: 'confirmed_rejected',
        lastErrorCode: result.errorCode,
        lastErrorMessage: result.message,
        reconciliationStatus: 'not_available',
      });
      if (result.errorCode === 'not_configured') {
        throw new DomainRuleError(
          result.message,
          'invoicingIntegration.errors.connectionRequired',
          { errorCode: result.errorCode },
        );
      }
      throw new DomainRuleError(result.message, 'invoicingIntegration.errors.providerFailed', {
        errorCode: result.errorCode,
        externalDocumentId: failed?.id ?? row.id,
      });
    }

    const reconciliation = reconcileExternalAmounts(
      input.billing,
      result.value.providerAmounts ?? null,
    );

    const updated = await updateExternalDocument(context, row.id, {
      status: result.value.status === 'issued' ? 'issued' : 'pending',
      issuanceOutcome: 'confirmed_created',
      externalId: result.value.externalId,
      externalNumber: result.value.externalNumber,
      externalUrl: result.value.externalUrl,
      pdf: result.value.pdf,
      issuedAt: result.value.issuedAt,
      reconciliationStatus: reconciliation.status,
      reconciliationMetadata: reconciliation.metadata,
      lastErrorCode: null,
      lastErrorMessage: null,
    });
    return updated!;
  } catch (error) {
    if (error instanceof SumitAmbiguousCreateError) {
      const ambiguous = await updateExternalDocument(context, row.id, {
        status: 'pending',
        issuanceOutcome: 'ambiguous',
        externalId: error.partialExternalId,
        lastErrorMessage: error.message,
        reconciliationStatus: 'pending',
      });
      throw new DomainRuleError(
        error.message,
        'invoicingIntegration.errors.ambiguousIssuance',
        { externalDocumentId: ambiguous?.id ?? row.id },
      );
    }
    await updateExternalDocument(context, row.id, {
      status: 'pending',
      issuanceOutcome: 'ambiguous',
      lastErrorMessage: error instanceof Error ? error.message : 'Unknown provider error',
      reconciliationStatus: 'pending',
    });
    throw error;
  }
}
