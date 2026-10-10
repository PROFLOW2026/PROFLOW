import 'server-only';

import { and, eq, inArray, lt, lte, or } from 'drizzle-orm';
import { connectedProjectMappings, crossOrgSyncOutbox } from '@drizzle/schema';
import { getAdminDb } from '@/shared/db/client';
import {
  applyClaimCashProjectionUpsert,
  applyClaimCashProjectionVoid,
} from './sync-claim-cash-projection';

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;

export interface ClaimCashProjectionOutboxRecoveryResult {
  readonly scanned: number;
  readonly applied: number;
  readonly failed: number;
  readonly skipped: number;
}

function backoffMs(attempts: number): number {
  const base = 60_000;
  return Math.min(base * 2 ** Math.max(0, attempts - 1), 6 * 60 * 60 * 1000);
}

/** Bounded retry for failed cross-org claim cash projection delivery (service_role only). */
export async function retryClaimCashProjectionOutbox(
  now: Date = new Date(),
): Promise<ClaimCashProjectionOutboxRecoveryResult> {
  const db = getAdminDb();
  let applied = 0;
  let failed = 0;
  let skipped = 0;

  const rows = await db
    .select()
    .from(crossOrgSyncOutbox)
    .where(
      and(
        inArray(crossOrgSyncOutbox.status, ['pending', 'failed']),
        lte(crossOrgSyncOutbox.nextAttemptAt, now),
        lt(crossOrgSyncOutbox.attempts, MAX_ATTEMPTS),
        or(
          eq(crossOrgSyncOutbox.eventType, 'subcontract.claim.cash_projection.upsert'),
          eq(crossOrgSyncOutbox.eventType, 'subcontract.claim.cash_projection.void'),
        ),
      ),
    )
    .orderBy(crossOrgSyncOutbox.nextAttemptAt)
    .limit(BATCH_SIZE);

  for (const row of rows) {
    const [mapping] = await db
      .select({
        id: connectedProjectMappings.id,
        contractorOrganizationId: connectedProjectMappings.contractorOrganizationId,
        contractorProjectId: connectedProjectMappings.contractorProjectId,
        developerOrganizationId: connectedProjectMappings.developerOrganizationId,
        status: connectedProjectMappings.status,
        revokedAt: connectedProjectMappings.revokedAt,
      })
      .from(connectedProjectMappings)
      .where(eq(connectedProjectMappings.id, row.mappingId))
      .limit(1);

    if (!mapping || mapping.revokedAt || mapping.status === 'revoked') {
      await db
        .update(crossOrgSyncOutbox)
        .set({ status: 'done', updatedAt: now })
        .where(eq(crossOrgSyncOutbox.id, row.id));
      skipped += 1;
      continue;
    }

    await db
      .update(crossOrgSyncOutbox)
      .set({ status: 'processing', updatedAt: now })
      .where(eq(crossOrgSyncOutbox.id, row.id));

    try {
      const payload = row.payload ?? {};
      if (row.eventType === 'subcontract.claim.cash_projection.upsert') {
        const payableBasisId = String(payload.payableBasisId ?? '');
        if (!payableBasisId || !mapping.contractorProjectId) {
          skipped += 1;
          await db
            .update(crossOrgSyncOutbox)
            .set({ status: 'done', updatedAt: now })
            .where(eq(crossOrgSyncOutbox.id, row.id));
          continue;
        }
        await applyClaimCashProjectionUpsert(db, {
          mappingId: mapping.id,
          contractorOrganizationId: mapping.contractorOrganizationId,
          contractorProjectId: mapping.contractorProjectId,
          developerOrganizationId: mapping.developerOrganizationId,
          payableBasisId,
        });
      } else {
        const claimId = String(payload.claimId ?? '');
        if (!claimId) {
          skipped += 1;
          await db
            .update(crossOrgSyncOutbox)
            .set({ status: 'done', updatedAt: now })
            .where(eq(crossOrgSyncOutbox.id, row.id));
          continue;
        }
        await applyClaimCashProjectionVoid(db, {
          mappingId: mapping.id,
          developerClaimId: claimId,
        });
      }

      await db
        .update(crossOrgSyncOutbox)
        .set({ status: 'done', lastError: null, updatedAt: now })
        .where(eq(crossOrgSyncOutbox.id, row.id));
      applied += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(crossOrgSyncOutbox)
        .set({
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          attempts,
          lastError: message.slice(0, 2000),
          nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)),
          updatedAt: now,
        })
        .where(eq(crossOrgSyncOutbox.id, row.id));
      failed += 1;
    }
  }

  return { scanned: rows.length, applied, failed, skipped };
}
