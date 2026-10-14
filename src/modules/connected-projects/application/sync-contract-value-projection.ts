import 'server-only';

import type { DbExecutor } from '@/shared/db/types';
import type { BusinessDate } from '@/shared/dates';
import { listActiveMappingsForDeveloperAgreement } from '../data/claim-cash-projection.repository';
import { upsertContractValueProjection } from '../data/contract-value-projection.repository';
import { enqueueCrossOrgSyncEvent } from '../data/sync-outbox.repository';

/** Outbox keys are versioned (`…:mapping:source:version`); projection upserts use the outbox idempotency key. */
export const CONTRACT_VALUE_SYNC_EVENT_TYPES = {
  agreementValue: 'subcontract.agreement.value.sync',
  changeApproved: 'subcontract.change.approved.sync',
  paymentReported: 'subcontract.payment.reported.sync',
} as const;

export type ContractValueSyncEventType =
  (typeof CONTRACT_VALUE_SYNC_EVENT_TYPES)[keyof typeof CONTRACT_VALUE_SYNC_EVENT_TYPES];

async function enqueueForAgreementMappings(
  db: DbExecutor,
  input: {
    readonly developerOrganizationId: string;
    readonly subcontractAgreementId: string;
    readonly eventType: ContractValueSyncEventType;
    readonly sourceKind: string;
    readonly sourceId: string;
    readonly amountNet: string;
    readonly currency: string;
    readonly effectiveDate: BusinessDate;
    readonly sourceVersion: number;
  },
): Promise<void> {
  const mappings = await listActiveMappingsForDeveloperAgreement(db, {
    developerOrganizationId: input.developerOrganizationId,
    subcontractAgreementId: input.subcontractAgreementId,
  });
  if (mappings.length === 0) return;

  for (const mapping of mappings) {
    if (!mapping.contractorProjectId) continue;
    const idempotencyKey = `${input.eventType}:${mapping.id}:${input.sourceId}:${input.sourceVersion}`;
    await enqueueCrossOrgSyncEvent(db, {
      mappingId: mapping.id,
      developerOrganizationId: input.developerOrganizationId,
      eventType: input.eventType,
      idempotencyKey,
      payload: {
        subcontractAgreementId: input.subcontractAgreementId,
        sourceKind: input.sourceKind,
        sourceId: input.sourceId,
        amountNet: input.amountNet,
        currency: input.currency,
        effectiveDate: input.effectiveDate,
        sourceVersion: input.sourceVersion,
      },
    });
  }
}

export async function enqueueAgreementValueSync(
  db: DbExecutor,
  input: {
    readonly developerOrganizationId: string;
    readonly subcontractAgreementId: string;
    readonly amountNet: string;
    readonly currency: string;
    readonly effectiveDate: BusinessDate;
    readonly sourceVersion: number;
  },
): Promise<void> {
  await enqueueForAgreementMappings(db, {
    ...input,
    eventType: CONTRACT_VALUE_SYNC_EVENT_TYPES.agreementValue,
    sourceKind: 'agreement_value',
    sourceId: input.subcontractAgreementId,
  });
}

export async function enqueueChangeApprovedValueSync(
  db: DbExecutor,
  input: {
    readonly developerOrganizationId: string;
    readonly subcontractAgreementId: string;
    readonly changeId: string;
    readonly amountNet: string;
    readonly currency: string;
    readonly effectiveDate: BusinessDate;
    readonly sourceVersion: number;
  },
): Promise<void> {
  await enqueueForAgreementMappings(db, {
    developerOrganizationId: input.developerOrganizationId,
    subcontractAgreementId: input.subcontractAgreementId,
    eventType: CONTRACT_VALUE_SYNC_EVENT_TYPES.changeApproved,
    sourceKind: 'change_approved',
    sourceId: input.changeId,
    amountNet: input.amountNet,
    currency: input.currency,
    effectiveDate: input.effectiveDate,
    sourceVersion: input.sourceVersion,
  });
}

export async function enqueuePaymentReportedValueSync(
  db: DbExecutor,
  input: {
    readonly developerOrganizationId: string;
    readonly subcontractAgreementId: string;
    readonly paymentId: string;
    readonly apBillId: string;
    readonly amountNet: string;
    readonly currency: string;
    readonly effectiveDate: BusinessDate;
    readonly sourceVersion: number;
  },
): Promise<void> {
  await enqueueForAgreementMappings(db, {
    developerOrganizationId: input.developerOrganizationId,
    subcontractAgreementId: input.subcontractAgreementId,
    eventType: CONTRACT_VALUE_SYNC_EVENT_TYPES.paymentReported,
    sourceKind: 'payment_reported',
    sourceId: `${input.paymentId}:${input.apBillId}`,
    amountNet: input.amountNet,
    currency: input.currency,
    effectiveDate: input.effectiveDate,
    sourceVersion: input.sourceVersion,
  });
}

export async function applyContractValueProjectionUpsert(
  db: DbExecutor,
  input: {
    readonly mappingId: string;
    readonly contractorOrganizationId: string;
    readonly contractorProjectId: string;
    readonly idempotencyKey: string;
    readonly payload: Record<string, unknown>;
  },
): Promise<void> {
  const sourceKind = String(input.payload.sourceKind ?? '');
  const sourceId = String(input.payload.sourceId ?? '');
  const amountNet = String(input.payload.amountNet ?? '0');
  const currency = String(input.payload.currency ?? 'ILS').toUpperCase();
  const effectiveDate = String(input.payload.effectiveDate ?? '') as BusinessDate;
  if (!sourceKind || !sourceId || !effectiveDate) return;

  await upsertContractValueProjection(db, {
    mappingId: input.mappingId,
    contractorOrganizationId: input.contractorOrganizationId,
    contractorProjectId: input.contractorProjectId,
    sourceKind,
    sourceId,
    amountNet,
    currency,
    effectiveDate,
    idempotencyKey: input.idempotencyKey,
  });
}
