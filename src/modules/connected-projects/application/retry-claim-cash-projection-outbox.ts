import 'server-only';

import { and, eq, lt, or, sql } from 'drizzle-orm';
import { connectedProjectMappings, crossOrgSyncOutbox } from '@drizzle/schema';
import { getAdminDb } from '@/shared/db/client';
import {
  applyClaimCashProjectionUpsert,
  applyClaimCashProjectionVoid,
} from './sync-claim-cash-projection';
import {
  applyContractValueProjectionUpsert,
  CONTRACT_VALUE_SYNC_EVENT_TYPES,
} from './sync-contract-value-projection';

const CROSS_ORG_SYNC_EVENT_TYPES = [
  'subcontract.claim.cash_projection.upsert',
  'subcontract.claim.cash_projection.void',
  CONTRACT_VALUE_SYNC_EVENT_TYPES.agreementValue,
  CONTRACT_VALUE_SYNC_EVENT_TYPES.changeApproved,
  CONTRACT_VALUE_SYNC_EVENT_TYPES.paymentReported,
] as const;

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;
const STALE_PROCESSING_MS = 15 * 60 * 1000;

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

function sqlResultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

type OutboxRow = typeof crossOrgSyncOutbox.$inferSelect;

async function reclaimStaleProcessingRows(db: ReturnType<typeof getAdminDb>, now: Date): Promise<void> {
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
  await db
    .update(crossOrgSyncOutbox)
    .set({ status: 'pending', updatedAt: now })
    .where(
      and(
        eq(crossOrgSyncOutbox.status, 'processing'),
        lt(crossOrgSyncOutbox.updatedAt, staleBefore),
        or(
          ...CROSS_ORG_SYNC_EVENT_TYPES.map((eventType) => eq(crossOrgSyncOutbox.eventType, eventType)),
        ),
      ),
    );
}

async function claimOutboxBatch(db: ReturnType<typeof getAdminDb>, now: Date): Promise<OutboxRow[]> {
  const result = await db.execute(sql`
    UPDATE cross_org_sync_outbox AS o
    SET status = 'processing', updated_at = ${now}
    FROM (
      SELECT id
      FROM cross_org_sync_outbox
      WHERE status IN ('pending', 'failed')
        AND next_attempt_at <= ${now}
        AND attempts < ${MAX_ATTEMPTS}
        AND event_type IN (${sql.join(CROSS_ORG_SYNC_EVENT_TYPES.map((t) => sql`${t}`), sql`, `)})
      ORDER BY next_attempt_at
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    ) AS pick
    WHERE o.id = pick.id
    RETURNING o.*
  `);
  return sqlResultRows<OutboxRow>(result);
}

/** Bounded retry for failed cross-org claim cash projection delivery (service_role only). */
export async function retryClaimCashProjectionOutbox(
  now: Date = new Date(),
): Promise<ClaimCashProjectionOutboxRecoveryResult> {
  const db = getAdminDb();
  let applied = 0;
  let failed = 0;
  let skipped = 0;

  await reclaimStaleProcessingRows(db, now);
  const rows = await claimOutboxBatch(db, now);

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
      } else if (row.eventType === 'subcontract.claim.cash_projection.void') {
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
      } else if (
        row.eventType === CONTRACT_VALUE_SYNC_EVENT_TYPES.agreementValue ||
        row.eventType === CONTRACT_VALUE_SYNC_EVENT_TYPES.changeApproved ||
        row.eventType === CONTRACT_VALUE_SYNC_EVENT_TYPES.paymentReported
      ) {
        if (!mapping.contractorProjectId) {
          skipped += 1;
          await db
            .update(crossOrgSyncOutbox)
            .set({ status: 'done', updatedAt: now })
            .where(eq(crossOrgSyncOutbox.id, row.id));
          continue;
        }
        await applyContractValueProjectionUpsert(db, {
          mappingId: mapping.id,
          contractorOrganizationId: mapping.contractorOrganizationId,
          contractorProjectId: mapping.contractorProjectId,
          idempotencyKey: row.idempotencyKey,
          payload,
        });
      } else {
        skipped += 1;
        await db
          .update(crossOrgSyncOutbox)
          .set({ status: 'done', updatedAt: now })
          .where(eq(crossOrgSyncOutbox.id, row.id));
        continue;
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

/** Wave 2 alias — same worker handles claim cash + contract value events. */
export const retryCrossOrgSyncOutbox = retryClaimCashProjectionOutbox;
