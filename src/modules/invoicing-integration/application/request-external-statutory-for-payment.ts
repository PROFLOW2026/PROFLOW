import { getBillingRecord } from '@/modules/billing';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertBillingBridgeSameOrg,
  createExternalDocument,
  findExternalDocument,
  listExternalDocuments,
  updateExternalDocument,
} from '../data/external-documents';
import {
  assertIssuanceEligible,
  findReusableRejectedDocument,
} from '../domain/assert-issuance-eligible';
import { buildStatutoryIdempotencyKey } from '../domain/idempotency-key';
import type {
  CreateExternalDocumentInput,
  CreateExternalDocumentOutput,
  StatutoryInvoicingProvider,
  StatutoryProviderResult,
} from '../domain/provider';
import { reconcileExternalAmounts } from '../domain/reconcile-external-amounts';
import {
  assertBillingEligibleForExternalRequest,
  assertBillingIsNotStatutoryIssuer,
  assertNotLocalStatutoryIssuance,
} from '../domain/separation';
import type { ExternalDocumentKind, ExternalStatutoryDocument } from '../domain/types';
import { getStatutoryInvoicingProvider } from '../domain/unconfigured-provider';
import { SumitAmbiguousCreateError } from '../providers/sumit/sumit-statutory-provider';
import { assertStatutoryFeatureEnabledForOrg } from './assert-feature-enabled';
import { buildPaymentStatutorySnapshot } from './build-payment-statutory-snapshot';
import { buildStatutoryBridgeFromBillingRecord } from './build-statutory-bridge';
import { resolveStatutoryProviderForOrg } from './resolve-statutory-provider';
import {
  requestExternalStatutoryDocumentCommitted,
  setCommittedPhaseRunnerForTests,
} from './request-external-document';

export { setCommittedPhaseRunnerForTests };

async function resolveProvider(
  context: OrgContext,
  provider?: StatutoryInvoicingProvider,
): Promise<StatutoryInvoicingProvider> {
  if (provider) return provider;
  const fromOrg = await resolveStatutoryProviderForOrg(context);
  return fromOrg.isConfigured() ? fromOrg : getStatutoryInvoicingProvider();
}

async function preparePaymentIssuanceLock(
  context: OrgContext,
  billingRecordId: string,
  paymentId: string,
  kind: ExternalDocumentKind,
  resolvedProvider: StatutoryInvoicingProvider,
): Promise<{ row: ExternalStatutoryDocument; bridge: CreateExternalDocumentInput['billing']; idempotencyKey: string }> {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  assertBillingIsNotStatutoryIssuer();
  await assertStatutoryFeatureEnabledForOrg(context, resolvedProvider);
  assertNotLocalStatutoryIssuance(resolvedProvider.id);

  const billing = await getBillingRecord(context, billingRecordId);
  await assertBillingBridgeSameOrg(context, billingRecordId, context.organizationId);
  const { bridge: eligibilityBridge } = buildStatutoryBridgeFromBillingRecord(
    context,
    billing,
    kind,
  );
  assertBillingEligibleForExternalRequest(eligibilityBridge);

  const existing = await listExternalDocuments(context, billingRecordId);
  assertIssuanceEligible(
    existing.filter((doc) => doc.paymentId == null || doc.paymentId === paymentId),
    kind,
  );

  const { bridge, idempotencyKey } = buildStatutoryBridgeFromBillingRecord(
    context,
    billing,
    kind,
    paymentId,
  );

  const reusable = findReusableRejectedDocument(
    existing.filter((doc) => doc.paymentId === paymentId),
    kind,
  );
  if (reusable) {
    const reopened = await updateExternalDocument(context, reusable.id, {
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
    });
    return { row: reopened!, bridge, idempotencyKey };
  }

  const row = await createExternalDocument(context, {
    billingRecordId,
    paymentId,
    providerId: resolvedProvider.id,
    kind,
    status: 'requested',
    issuanceOutcome: 'in_flight',
    idempotencyKey,
    reconciliationStatus: 'pending',
  });

  return { row, bridge, idempotencyKey };
}

export async function requestExternalStatutoryDocumentForPaymentCommitted(
  userId: string,
  organizationId: string,
  paymentId: string,
  billingRecordId: string,
  kind: ExternalDocumentKind,
  linkedTaxInvoiceExternalId: string | null = null,
  provider?: StatutoryInvoicingProvider,
): Promise<ExternalStatutoryDocument> {
  if (kind !== 'receipt' && kind !== 'tax_invoice_receipt') {
    throw new DomainRuleError(
      'Payment-linked statutory issuance supports receipt kinds only',
      'invoicingIntegration.errors.invalidDocumentKind',
    );
  }

  const { runInOrgContext } = await import('@/shared/auth/session');

  const prepared = await runInOrgContext(userId, organizationId, async (context) => {
    const resolvedProvider = await resolveProvider(context, provider);
    const paymentSnapshot = await buildPaymentStatutorySnapshot(context, paymentId);
    const lock = await preparePaymentIssuanceLock(
      context,
      billingRecordId,
      paymentId,
      kind,
      resolvedProvider,
    );
    return { ...lock, paymentSnapshot, resolvedProvider };
  });

  const createInput: CreateExternalDocumentInput = {
    organizationId,
    billing: prepared.bridge,
    kind,
    idempotencyKey: prepared.idempotencyKey,
    payment: prepared.paymentSnapshot,
    linkedTaxInvoiceExternalId,
  };

  let result: StatutoryProviderResult<CreateExternalDocumentOutput>;
  try {
    result = await prepared.resolvedProvider.createDocument(createInput);
  } catch (error) {
    if (error instanceof SumitAmbiguousCreateError) {
      await runInOrgContext(userId, organizationId, async (context) => {
        await updateExternalDocument(context, prepared.row.id, {
          status: 'pending',
          issuanceOutcome: 'ambiguous',
          externalId: error.partialExternalId,
          lastErrorMessage: error.message,
          reconciliationStatus: 'pending',
        });
      });
      throw error;
    }
    await runInOrgContext(userId, organizationId, async (context) => {
      await updateExternalDocument(context, prepared.row.id, {
        status: 'pending',
        issuanceOutcome: 'ambiguous',
        lastErrorMessage: error instanceof Error ? error.message : 'Unknown provider error',
        reconciliationStatus: 'pending',
      });
    });
    throw error;
  }

  if (!result.ok) {
    await runInOrgContext(userId, organizationId, async (context) => {
      await updateExternalDocument(context, prepared.row.id, {
        status: 'cancelled',
        issuanceOutcome: 'confirmed_rejected',
        lastErrorCode: result.errorCode,
        lastErrorMessage: result.message,
        reconciliationStatus: 'not_available',
      });
    });
    throw new DomainRuleError(result.message, 'invoicingIntegration.errors.providerFailed', {
      errorCode: result.errorCode,
      externalDocumentId: prepared.row.id,
    });
  }

  return runInOrgContext(userId, organizationId, async (context) => {
    const billing = await getBillingRecord(context, billingRecordId);
    const { bridge } = buildStatutoryBridgeFromBillingRecord(context, billing, kind, paymentId);
    const reconciliation = reconcileExternalAmounts(bridge, result.value.providerAmounts ?? null);

    const updated = await updateExternalDocument(context, prepared.row.id, {
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
    return updated ?? (await findExternalDocument(context, prepared.row.id))!;
  });
}

/** Issue transaction invoice (no payment) — reuses billing committed path. */
export async function requestTransactionInvoiceCommitted(
  userId: string,
  organizationId: string,
  billingRecordId: string,
  provider?: StatutoryInvoicingProvider,
): Promise<ExternalStatutoryDocument> {
  return requestExternalStatutoryDocumentCommitted(
    userId,
    organizationId,
    billingRecordId,
    'transaction_invoice',
    provider,
  );
}

export function buildPaymentStatutoryIdempotencyKey(
  paymentId: string,
  kind: ExternalDocumentKind,
  billingRecordId: string,
): string {
  return buildStatutoryIdempotencyKey(billingRecordId, kind, paymentId);
}
