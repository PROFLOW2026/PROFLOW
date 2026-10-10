import 'server-only';

import { and, eq, sql } from 'drizzle-orm';
import { connectedClaimCashProjections } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { claimCashProjectionIdempotencyKey } from '@/modules/subcontract-claims/domain/certified-receipt-cash-flow';
import type { ActiveClaimCashProjectionRow } from '../domain/claim-cash-projection';

export type { ActiveClaimCashProjectionRow } from '../domain/claim-cash-projection';

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === '42P01' || code === '42703';
}

export async function listActiveClaimCashProjectionsForOrg(
  db: DbExecutor,
  contractorOrganizationId: string,
  filter: { readonly contractorProjectId?: string; readonly currency?: string } = {},
): Promise<ActiveClaimCashProjectionRow[]> {
  try {
    const conditions = [
      eq(connectedClaimCashProjections.contractorOrganizationId, contractorOrganizationId),
      eq(connectedClaimCashProjections.status, 'active'),
    ];
    if (filter.contractorProjectId) {
      conditions.push(eq(connectedClaimCashProjections.contractorProjectId, filter.contractorProjectId));
    }
    if (filter.currency) {
      conditions.push(eq(connectedClaimCashProjections.currency, filter.currency.toUpperCase()));
    }
    const rows = await db
      .select({
        id: connectedClaimCashProjections.id,
        mappingId: connectedClaimCashProjections.mappingId,
        contractorProjectId: connectedClaimCashProjections.contractorProjectId,
        developerClaimId: connectedClaimCashProjections.developerClaimId,
        developerPayableBasisId: connectedClaimCashProjections.developerPayableBasisId,
        certifiedNet: connectedClaimCashProjections.certifiedNet,
        retentionNet: connectedClaimCashProjections.retentionNet,
        currency: connectedClaimCashProjections.currency,
        expectedReceiptDate: connectedClaimCashProjections.expectedReceiptDate,
        certainty: connectedClaimCashProjections.certainty,
        sourceVersion: connectedClaimCashProjections.sourceVersion,
      })
      .from(connectedClaimCashProjections)
      .where(and(...conditions));
    return rows.flatMap((row) => {
      if (!row.contractorProjectId) return [];
      return [
        {
          ...row,
          contractorProjectId: row.contractorProjectId,
          expectedReceiptDate: (row.expectedReceiptDate as BusinessDate | null) ?? null,
        },
      ];
    });
  } catch (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
}

export async function voidActiveClaimCashProjectionsForClaim(
  db: DbExecutor,
  input: {
    readonly mappingId: string;
    readonly developerClaimId: string;
  },
): Promise<void> {
  try {
    await db
      .update(connectedClaimCashProjections)
      .set({ status: 'void', supersededAt: new Date() })
      .where(
        and(
          eq(connectedClaimCashProjections.mappingId, input.mappingId),
          eq(connectedClaimCashProjections.developerClaimId, input.developerClaimId),
          eq(connectedClaimCashProjections.status, 'active'),
        ),
      );
  } catch (error) {
    if (isMissingRelationError(error)) return;
    throw error;
  }
}

export interface UpsertClaimCashProjectionInput {
  readonly mappingId: string;
  readonly contractorOrganizationId: string;
  readonly contractorProjectId: string;
  readonly developerOrganizationId: string;
  readonly developerClaimId: string;
  readonly developerPayableBasisId: string;
  readonly certifiedNet: string;
  readonly retentionNet: string;
  readonly currency: string;
  readonly expectedReceiptDate: BusinessDate | null;
  readonly certainty: 'confirmed' | 'estimated';
  readonly sourceVersion: number;
}

/** Idempotent upsert keyed by (mapping, payable basis). Supersedes prior active row for same basis. */
export async function upsertClaimCashProjection(
  db: DbExecutor,
  input: UpsertClaimCashProjectionInput,
): Promise<void> {
  const idempotencyKey = claimCashProjectionIdempotencyKey({
    mappingId: input.mappingId,
    payableBasisId: input.developerPayableBasisId,
  });
  try {
    await db
      .update(connectedClaimCashProjections)
      .set({ status: 'superseded', supersededAt: new Date() })
      .where(
        and(
          eq(connectedClaimCashProjections.mappingId, input.mappingId),
          eq(connectedClaimCashProjections.developerPayableBasisId, input.developerPayableBasisId),
          eq(connectedClaimCashProjections.status, 'active'),
        ),
      );
    await db.insert(connectedClaimCashProjections).values({
      mappingId: input.mappingId,
      contractorOrganizationId: input.contractorOrganizationId,
      contractorProjectId: input.contractorProjectId,
      developerOrganizationId: input.developerOrganizationId,
      developerClaimId: input.developerClaimId,
      developerPayableBasisId: input.developerPayableBasisId,
      certifiedNet: input.certifiedNet,
      retentionNet: input.retentionNet,
      currency: input.currency,
      expectedReceiptDate: input.expectedReceiptDate,
      certainty: input.certainty,
      status: 'active',
      sourceVersion: input.sourceVersion,
      idempotencyKey,
    });
  } catch (error) {
    if (isMissingRelationError(error)) return;
    const code = (error as { code?: string }).code;
    if (code === '23505') return;
    throw error;
  }
}

export async function listActiveMappingsForDeveloperAgreement(
  db: DbExecutor,
  input: { readonly developerOrganizationId: string; readonly subcontractAgreementId: string },
): Promise<
  readonly {
    readonly id: string;
    readonly contractorOrganizationId: string;
    readonly contractorProjectId: string | null;
  }[]
> {
  try {
    const result = await db.execute(sql`
      select id, contractor_organization_id, contractor_project_id
      from connected_project_mappings
      where developer_organization_id = ${input.developerOrganizationId}
        and subcontract_agreement_id = ${input.subcontractAgreementId}
        and status in ('provisioning', 'active')
        and contractor_project_id is not null
    `);
    const rows = (Array.isArray(result) ? result : (result as { rows: Record<string, unknown>[] }).rows) ?? [];
    return rows.map((row) => ({
      id: String(row.id),
      contractorOrganizationId: String(row.contractor_organization_id),
      contractorProjectId: row.contractor_project_id ? String(row.contractor_project_id) : null,
    }));
  } catch (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
}
