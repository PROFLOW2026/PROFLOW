import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertBillingBridgeSameOrg,
  createExternalDocument,
  updateExternalDocument,
} from '../data/external-documents';
import type { StatutoryInvoicingProvider } from '../domain/provider';
import {
  assertBillingEligibleForExternalRequest,
  assertBillingIsNotStatutoryIssuer,
  assertNotLocalStatutoryIssuance,
} from '../domain/separation';
import type { ExternalStatutoryDocument } from '../domain/types';
import { getStatutoryInvoicingProvider } from '../domain/unconfigured-provider';
import {
  requestExternalDocumentSchema,
  type RequestExternalDocumentInput,
} from '../validation/schemas';
import { assertStatutoryFeatureEnabled } from './assert-feature-enabled';

/**
 * Billing Record → user requests external statutory document → provider → store refs.
 * Does not change BillingRecord amounts; does not issue locally.
 */
export async function requestExternalStatutoryDocument(
  context: OrgContext,
  rawInput: RequestExternalDocumentInput,
  provider: StatutoryInvoicingProvider = getStatutoryInvoicingProvider(),
): Promise<ExternalStatutoryDocument> {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  assertStatutoryFeatureEnabled(provider);
  assertNotLocalStatutoryIssuance(provider.id);
  assertBillingIsNotStatutoryIssuer();

  const input = requestExternalDocumentSchema.parse(rawInput);
  await assertBillingBridgeSameOrg(
    context,
    input.billing.billingRecordId,
    input.billing.organizationId,
  );
  assertBillingEligibleForExternalRequest(input.billing);

  const row = await createExternalDocument(context, {
    billingRecordId: input.billing.billingRecordId,
    providerId: provider.id,
    kind: input.kind,
    status: 'requested',
  });

  const result = await provider.createDocument({
    organizationId: context.organizationId,
    billing: input.billing,
    kind: input.kind,
    idempotencyKey: input.idempotencyKey,
  });

  if (!result.ok) {
    const failed = await updateExternalDocument(context, row.id, {
      status: 'failed',
      lastErrorCode: result.errorCode,
      lastErrorMessage: result.message,
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

  const updated = await updateExternalDocument(context, row.id, {
    status: result.value.status === 'issued' ? 'issued' : 'pending',
    externalId: result.value.externalId,
    externalNumber: result.value.externalNumber,
    externalUrl: result.value.externalUrl,
    pdf: result.value.pdf,
    issuedAt: result.value.issuedAt,
    lastErrorCode: null,
    lastErrorMessage: null,
  });
  return updated!;
}
