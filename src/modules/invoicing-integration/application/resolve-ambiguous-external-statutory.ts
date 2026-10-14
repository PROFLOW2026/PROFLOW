import { getBillingRecord } from '@/modules/billing';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import {
  findExternalDocumentByProviderId,
  updateExternalDocument,
} from '../data/external-documents';
import { reconcileExternalAmounts } from '../domain/reconcile-external-amounts';
import type { ExternalStatutoryDocument, ReconciliationMetadata } from '../domain/types';
import { SUMIT_PROVIDER_ID } from '../domain/types';
import {
  absenceProofFromMetadata,
  hasManualAbsenceConfirmation,
  isSumitAbsenceProofEnabled,
  mergeAbsenceProofMetadata,
  qualifiesAutomaticAbsenceProof,
  type AbsenceProofScanRecord,
} from '../domain/sumit-absence-proof';
import type { SumitStatutoryProvider } from '../providers/sumit/sumit-statutory-provider';
import { buildStatutoryBridgeFromBillingRecord } from './build-statutory-bridge';

export interface AmbiguousRecoveryScanResult {
  readonly foundDocumentId: string | null;
  readonly scanRecord: AbsenceProofScanRecord;
}

function dayBefore(isoInstant: string): string {
  const date = new Date(isoInstant);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function todayIsoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function scanSumitForAmbiguousDocument(
  provider: SumitStatutoryProvider,
  input: {
    readonly idempotencyKey: string;
    readonly requestedAt: string;
    readonly now?: Date;
  },
): Promise<AmbiguousRecoveryScanResult> {
  const now = input.now ?? new Date();
  const lookup = await provider.findDocumentByExternalReference({
    externalReference: input.idempotencyKey,
    dateFrom: dayBefore(input.requestedAt),
    dateTo: todayIsoDate(now),
  });

  if (lookup.foundDocumentId) {
    return {
      foundDocumentId: lookup.foundDocumentId,
      scanRecord: {
        completedAt: now.toISOString(),
        result: 'found',
        reason: null,
      },
    };
  }

  return {
    foundDocumentId: null,
    scanRecord: {
      completedAt: now.toISOString(),
      result: lookup.proofEligible ? 'empty' : 'inconclusive',
      reason: lookup.inconclusiveReason ?? null,
    },
  };
}

async function persistLinkedFromScan(
  context: OrgContext,
  existing: ExternalStatutoryDocument,
  provider: SumitStatutoryProvider,
  documentId: string,
  scanRecord: AbsenceProofScanRecord,
): Promise<ExternalStatutoryDocument> {
  const billing = await getBillingRecord(context, existing.billingRecordId);
  const { bridge } = buildStatutoryBridgeFromBillingRecord(context, billing);
  const details = await provider.fetchDocumentDetails(documentId);
  const providerAmounts = provider.mapProviderAmounts(bridge.totalAmount.currency, details);
  const reconciliation = reconcileExternalAmounts(bridge, providerAmounts);

  const priorMeta = (existing.reconciliationMetadata ?? {}) as Record<string, unknown>;
  const reconciliationMetadata = mergeAbsenceProofMetadata(priorMeta, {
    absenceProofScans: [...(absenceProofFromMetadata(priorMeta).absenceProofScans ?? []), scanRecord],
  }) as unknown as ReconciliationMetadata;

  const updated = await updateExternalDocument(context, existing.id, {
    status: 'issued',
    issuanceOutcome: 'confirmed_created',
    externalId: documentId,
    externalNumber: details.documentNumber,
    reconciliationStatus: reconciliation.status,
    reconciliationMetadata,
    lastErrorCode: null,
    lastErrorMessage: null,
    issuedAt: new Date().toISOString(),
  });
  return updated!;
}

async function persistAbsenceConfirmedRejected(
  context: OrgContext,
  existing: ExternalStatutoryDocument,
  scanRecord: AbsenceProofScanRecord,
): Promise<ExternalStatutoryDocument> {
  const priorMeta = (existing.reconciliationMetadata ?? {}) as Record<string, unknown>;
  const priorScans = absenceProofFromMetadata(priorMeta).absenceProofScans ?? [];
  const reconciliationMetadata = mergeAbsenceProofMetadata(priorMeta, {
    absenceProofScans: [...priorScans, scanRecord],
  }) as unknown as ReconciliationMetadata;

  const updated = await updateExternalDocument(context, existing.id, {
    status: 'cancelled',
    issuanceOutcome: 'confirmed_rejected',
    lastErrorCode: 'confirmed_absent',
    lastErrorMessage: 'SUMIT document absence confirmed — safe to retry with same idempotency key',
    reconciliationStatus: 'not_available',
    reconciliationMetadata,
  });
  return updated!;
}

async function persistScanOnly(
  context: OrgContext,
  existing: ExternalStatutoryDocument,
  scanRecord: AbsenceProofScanRecord,
): Promise<ExternalStatutoryDocument> {
  const priorMeta = (existing.reconciliationMetadata ?? {}) as Record<string, unknown>;
  const priorScans = absenceProofFromMetadata(priorMeta).absenceProofScans ?? [];
  const reconciliationMetadata = mergeAbsenceProofMetadata(priorMeta, {
    absenceProofScans: [...priorScans, scanRecord],
  }) as unknown as ReconciliationMetadata;

  const updated = await updateExternalDocument(context, existing.id, {
    reconciliationMetadata,
  });
  return updated!;
}

/**
 * Recovery path for ambiguous statutory rows without externalId (SUMIT read-only scan).
 */
export async function resolveAmbiguousExternalStatutoryDocument(
  context: OrgContext,
  existing: ExternalStatutoryDocument,
  provider: SumitStatutoryProvider,
  options: { readonly now?: Date } = {},
): Promise<ExternalStatutoryDocument> {
  if (existing.issuanceOutcome !== 'ambiguous') {
    throw new DomainRuleError(
      'Only ambiguous documents can be recovered without external id',
      'invoicingIntegration.errors.invalidIssuanceState',
    );
  }
  if (existing.externalId) {
    throw new DomainRuleError(
      'Document already has external id',
      'invoicingIntegration.errors.missingExternalId',
    );
  }
  if (provider.id !== SUMIT_PROVIDER_ID) {
    throw new DomainRuleError(
      'Ambiguous recovery without external id requires SUMIT',
      'invoicingIntegration.errors.providerFailed',
    );
  }

  const idempotencyKey = existing.idempotencyKey?.trim();
  if (!idempotencyKey) {
    throw new DomainRuleError(
      'External document has no idempotency key for SUMIT lookup',
      'invoicingIntegration.errors.missingExternalId',
    );
  }

  const now = options.now ?? new Date();
  const scan = await scanSumitForAmbiguousDocument(provider, {
    idempotencyKey,
    requestedAt: existing.requestedAt,
    now,
  });

  if (scan.foundDocumentId) {
    const conflict = await findExternalDocumentByProviderId(context, scan.foundDocumentId);
    if (conflict && conflict.id !== existing.id) {
      throw new DomainRuleError(
        'SUMIT document id is already linked to another statutory row',
        'invoicingIntegration.errors.externalIdAlreadyLinked',
        { externalId: scan.foundDocumentId },
      );
    }
    return persistLinkedFromScan(context, existing, provider, scan.foundDocumentId, scan.scanRecord);
  }

  const priorMeta = (existing.reconciliationMetadata ?? {}) as Record<string, unknown>;
  const proofMeta = absenceProofFromMetadata(priorMeta);
  const scansAfter = [...(proofMeta.absenceProofScans ?? []), scan.scanRecord];

  const automaticProof = qualifiesAutomaticAbsenceProof({
    scans: scansAfter,
    issuanceRequestedAt: existing.requestedAt,
    now,
    absenceProofEnabled: isSumitAbsenceProofEnabled(),
  });
  const manualProof = hasManualAbsenceConfirmation(proofMeta);

  if (automaticProof || manualProof) {
    return persistAbsenceConfirmedRejected(context, existing, scan.scanRecord);
  }

  return persistScanOnly(context, existing, scan.scanRecord);
}
