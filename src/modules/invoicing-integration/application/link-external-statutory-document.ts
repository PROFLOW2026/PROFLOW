import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError, DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findExternalDocument,
  findExternalDocumentByProviderId,
  updateExternalDocument,
} from '../data/external-documents';
import type { ExternalStatutoryDocument, ReconciliationMetadata } from '../domain/types';
import { SUMIT_PROVIDER_ID } from '../domain/types';
import { mergeAbsenceProofMetadata } from '../domain/sumit-absence-proof';
import { areInvoicingIntegrationTablesAvailable } from '../domain/persistence';
import { getStatutoryInvoicingProvider } from '../domain/unconfigured-provider';
import { resolveStatutoryProviderForOrg } from './resolve-statutory-provider';
import { SumitStatutoryProvider } from '../providers/sumit/sumit-statutory-provider';
import { getBillingRecord } from '@/modules/billing';
import { buildStatutoryBridgeFromBillingRecord } from './build-statutory-bridge';
import { reconcileExternalAmounts } from '../domain/reconcile-external-amounts';
import {
  linkExternalStatutoryDocumentSchema,
  type LinkExternalStatutoryDocumentInput,
} from '../validation/schemas';

function readSumitExternalReference(raw: unknown): string | null {
  const root = raw as Record<string, unknown>;
  const dataObj =
    root.Data && typeof root.Data === 'object'
      ? (root.Data as Record<string, unknown>)
      : root;
  const detailsObj =
    dataObj.Details && typeof dataObj.Details === 'object'
      ? (dataObj.Details as Record<string, unknown>)
      : null;
  const ref = detailsObj?.ExternalReference ?? dataObj.ExternalReference;
  if (typeof ref === 'string' && ref.trim()) return ref.trim();
  if (typeof ref === 'number') return String(ref);
  return null;
}

export async function linkExternalStatutoryDocument(
  context: OrgContext,
  rawInput: LinkExternalStatutoryDocumentInput,
): Promise<ExternalStatutoryDocument> {
  if (!context.permissions.has(PERMISSIONS.BILLING_MANAGE)) {
    throw new AuthorizationError();
  }
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);

  const input = linkExternalStatutoryDocumentSchema.parse(rawInput);
  const existing = await findExternalDocument(context, input.externalDocumentId);
  if (!existing) throw new NotFoundError('ExternalStatutoryDocument');

  if (existing.issuanceOutcome !== 'ambiguous' || existing.externalId) {
    throw new DomainRuleError(
      'Manual link is only allowed for ambiguous documents without external id',
      'invoicingIntegration.errors.invalidIssuanceState',
    );
  }

  const provider = areInvoicingIntegrationTablesAvailable()
    ? await resolveStatutoryProviderForOrg(context)
    : getStatutoryInvoicingProvider();
  if (provider.id !== SUMIT_PROVIDER_ID || !(provider instanceof SumitStatutoryProvider)) {
    throw new DomainRuleError(
      'Manual SUMIT link requires a configured SUMIT provider',
      'invoicingIntegration.errors.connectionRequired',
    );
  }

  const sumitDocumentId = input.sumitDocumentId.trim();
  const conflict = await findExternalDocumentByProviderId(context, sumitDocumentId);
  if (conflict && conflict.id !== existing.id) {
    throw new DomainRuleError(
      'SUMIT document is already linked to another statutory row',
      'invoicingIntegration.errors.externalIdAlreadyLinked',
      { externalId: sumitDocumentId },
    );
  }

  const details = await provider.fetchDocumentDetails(sumitDocumentId);
  if (!details.documentId) {
    throw new DomainRuleError(
      'SUMIT document was not found',
      'invoicingIntegration.errors.providerFailed',
    );
  }

  const expectedReference = existing.idempotencyKey?.trim() ?? '';
  const remoteReference = readSumitExternalReference(details.raw);
  if (
    expectedReference &&
    remoteReference &&
    remoteReference !== expectedReference &&
    !input.allowExternalReferenceMismatch
  ) {
    throw new DomainRuleError(
      'SUMIT ExternalReference does not match this billing idempotency key',
      'invoicingIntegration.errors.externalReferenceMismatch',
      { expectedReference, remoteReference },
    );
  }

  const billing = await getBillingRecord(context, existing.billingRecordId);
  const { bridge } = buildStatutoryBridgeFromBillingRecord(context, billing);
  const providerAmounts = provider.mapProviderAmounts(bridge.totalAmount.currency, details);
  const reconciliation = reconcileExternalAmounts(bridge, providerAmounts);

  const priorMeta = (existing.reconciliationMetadata ?? {}) as Record<string, unknown>;
  const reconciliationMetadata = mergeAbsenceProofMetadata(priorMeta, {}) as unknown as ReconciliationMetadata;

  const updated = await updateExternalDocument(context, existing.id, {
    status: 'issued',
    issuanceOutcome: 'confirmed_created',
    externalId: sumitDocumentId,
    externalNumber: details.documentNumber,
    reconciliationStatus: reconciliation.status,
    reconciliationMetadata,
    lastErrorCode: null,
    lastErrorMessage: null,
    issuedAt: new Date().toISOString(),
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.STATUTORY_DOCUMENT_MANUALLY_LINKED,
    entityType: 'external_statutory_document',
    entityId: existing.id,
    metadata: {
      sumitDocumentId,
      expectedReference,
      remoteReference,
      allowExternalReferenceMismatch: input.allowExternalReferenceMismatch ?? false,
    },
  });

  return updated!;
}
