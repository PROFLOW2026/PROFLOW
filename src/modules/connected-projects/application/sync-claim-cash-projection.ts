import 'server-only';

import type { DbExecutor } from '@/shared/db/types';
import { certifiedReceiptFactsForBasis } from '@/modules/subcontract-claims/application/certified-receipt-forecast';
import {
  listActiveMappingsForDeveloperAgreement,
  upsertClaimCashProjection,
  voidActiveClaimCashProjectionsForClaim,
} from '../data/claim-cash-projection.repository';
import { enqueueCrossOrgSyncEvent } from '../data/sync-outbox.repository';

export type ClaimCashSyncEventType =
  | 'subcontract.claim.cash_projection.upsert'
  | 'subcontract.claim.cash_projection.void';

export async function enqueueClaimCashProjectionSync(
  db: DbExecutor,
  input: {
    readonly developerOrganizationId: string;
    readonly subcontractAgreementId: string;
    readonly claimId: string;
    readonly payableBasisId: string;
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
    const idempotencyKey = `subcontract.claim.cash_projection.upsert:${mapping.id}:${input.payableBasisId}:${input.sourceVersion}`;
    await enqueueCrossOrgSyncEvent(db, {
      mappingId: mapping.id,
      developerOrganizationId: input.developerOrganizationId,
      eventType: 'subcontract.claim.cash_projection.upsert',
      idempotencyKey,
      payload: {
        claimId: input.claimId,
        payableBasisId: input.payableBasisId,
        sourceVersion: input.sourceVersion,
        subcontractAgreementId: input.subcontractAgreementId,
      },
    });
  }
}

export async function enqueueClaimCashProjectionVoidSync(
  db: DbExecutor,
  input: {
    readonly developerOrganizationId: string;
    readonly subcontractAgreementId: string;
    readonly claimId: string;
    readonly sourceVersion: number;
  },
): Promise<void> {
  const mappings = await listActiveMappingsForDeveloperAgreement(db, {
    developerOrganizationId: input.developerOrganizationId,
    subcontractAgreementId: input.subcontractAgreementId,
  });
  if (mappings.length === 0) return;

  for (const mapping of mappings) {
    const idempotencyKey = `subcontract.claim.cash_projection.void:${mapping.id}:${input.claimId}:${input.sourceVersion}`;
    await enqueueCrossOrgSyncEvent(db, {
      mappingId: mapping.id,
      developerOrganizationId: input.developerOrganizationId,
      eventType: 'subcontract.claim.cash_projection.void',
      idempotencyKey,
      payload: {
        claimId: input.claimId,
        subcontractAgreementId: input.subcontractAgreementId,
        sourceVersion: input.sourceVersion,
      },
    });
  }
}

/** Worker / inline apply: writes contractor-org projection rows (not payment truth). */
export async function applyClaimCashProjectionUpsert(
  db: DbExecutor,
  input: {
    readonly mappingId: string;
    readonly contractorOrganizationId: string;
    readonly contractorProjectId: string;
    readonly developerOrganizationId: string;
    readonly payableBasisId: string;
  },
): Promise<void> {
  const entry = await certifiedReceiptFactsForBasis(db, input.developerOrganizationId, input.payableBasisId);
  if (!entry) return;

  const payableLine = entry.lines.find((line) => line.lineKey === 'payable');
  const retentionLine = entry.lines.find((line) => line.lineKey === 'retention');
  if (!payableLine && !retentionLine) return;

  await upsertClaimCashProjection(db, {
    mappingId: input.mappingId,
    contractorOrganizationId: input.contractorOrganizationId,
    contractorProjectId: input.contractorProjectId,
    developerOrganizationId: input.developerOrganizationId,
    developerClaimId: entry.facts.claimId,
    developerPayableBasisId: entry.facts.payableBasisId,
    certifiedNet: payableLine?.amount.amount ?? '0',
    retentionNet: retentionLine?.amount.amount ?? '0',
    currency: entry.facts.payableNet.currency,
    expectedReceiptDate: payableLine?.dueDate ?? null,
    certainty: payableLine?.certainty === 'confirmed' ? 'confirmed' : 'estimated',
    sourceVersion: entry.facts.sourceVersion,
  });
}

export async function applyClaimCashProjectionVoid(
  db: DbExecutor,
  input: { readonly mappingId: string; readonly developerClaimId: string },
): Promise<void> {
  await voidActiveClaimCashProjectionsForClaim(db, input);
}

/** Post-commit delivery (service-role DB): materializes projections without waiting for a worker. */
export async function deliverClaimCashProjectionUpsert(
  db: DbExecutor,
  input: {
    readonly developerOrganizationId: string;
    readonly subcontractAgreementId: string;
    readonly payableBasisId: string;
  },
): Promise<void> {
  const mappings = await listActiveMappingsForDeveloperAgreement(db, {
    developerOrganizationId: input.developerOrganizationId,
    subcontractAgreementId: input.subcontractAgreementId,
  });
  for (const mapping of mappings) {
    if (!mapping.contractorProjectId) continue;
    await applyClaimCashProjectionUpsert(db, {
      mappingId: mapping.id,
      contractorOrganizationId: mapping.contractorOrganizationId,
      contractorProjectId: mapping.contractorProjectId,
      developerOrganizationId: input.developerOrganizationId,
      payableBasisId: input.payableBasisId,
    });
  }
}

export async function deliverClaimCashProjectionVoid(
  db: DbExecutor,
  input: {
    readonly developerOrganizationId: string;
    readonly subcontractAgreementId: string;
    readonly claimId: string;
  },
): Promise<void> {
  const mappings = await listActiveMappingsForDeveloperAgreement(db, {
    developerOrganizationId: input.developerOrganizationId,
    subcontractAgreementId: input.subcontractAgreementId,
  });
  for (const mapping of mappings) {
    await applyClaimCashProjectionVoid(db, {
      mappingId: mapping.id,
      developerClaimId: input.claimId,
    });
  }
}
