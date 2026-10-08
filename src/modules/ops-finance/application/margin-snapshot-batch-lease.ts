import 'server-only';

import { asc, isNull, sql } from 'drizzle-orm';
import { organizations } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { upsertOrganizationSettingValue } from '@/modules/tenancy/application/organization-setting-values';

/** Stored on the lexicographically first active org — platform-wide batch lease (single deployment). */
export const MARGIN_SNAPSHOT_BATCH_LEASE_SETTING_KEY = 'platform.margin_snapshot_batch_utc_v1';

const RUNNING_LEASE_TTL_MS = 55 * 60 * 1000;

export type MarginSnapshotBatchLeaseValue = {
  readonly utcDay: string;
  readonly status: 'running' | 'completed';
  readonly token: string;
  readonly startedAt: string;
  readonly expiresAt: string;
  readonly completedAt?: string;
};

export type MarginSnapshotBatchLeaseDecision =
  | { readonly action: 'run'; readonly holderOrganizationId: string; readonly token: string }
  | { readonly action: 'skip'; readonly reason: 'already_completed' | 'lease_held' };

type TransactionCapableDb = {
  transaction: <T>(fn: (tx: DbExecutor) => Promise<T>) => Promise<T>;
};

function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function parseLease(raw: unknown): MarginSnapshotBatchLeaseValue | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.utcDay !== 'string') return null;
  if (row.status !== 'running' && row.status !== 'completed') return null;
  if (typeof row.token !== 'string') return null;
  if (typeof row.startedAt !== 'string') return null;
  if (typeof row.expiresAt !== 'string') return null;
  return {
    utcDay: row.utcDay,
    status: row.status,
    token: row.token,
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    completedAt: typeof row.completedAt === 'string' ? row.completedAt : undefined,
  };
}

function runLeaseTransaction<T>(db: DbExecutor, fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  return (db as DbExecutor & TransactionCapableDb).transaction(fn);
}

async function lockMarginSnapshotBatchLease(tx: DbExecutor): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${MARGIN_SNAPSHOT_BATCH_LEASE_SETTING_KEY}))`,
  );
}

async function readLeaseForUpdate(
  tx: DbExecutor,
  holderOrganizationId: string,
): Promise<MarginSnapshotBatchLeaseValue | null> {
  const rows = (await tx.execute(
    sql`SELECT value FROM organization_settings WHERE organization_id = ${holderOrganizationId}::uuid AND key = ${MARGIN_SNAPSHOT_BATCH_LEASE_SETTING_KEY} FOR UPDATE`,
  )) as { value: unknown }[];
  const row = rows[0];
  return parseLease(row?.value ?? null);
}

export async function pickMarginSnapshotBatchLeaseHolderOrganizationId(
  db: DbExecutor,
): Promise<string | null> {
  const [row] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(isNull(organizations.archivedAt))
    .orderBy(asc(organizations.id))
    .limit(1);
  return row?.id ?? null;
}

function decideFromExistingLease(
  existing: MarginSnapshotBatchLeaseValue | null,
  utcDay: string,
  token: string,
  now: Date,
): MarginSnapshotBatchLeaseDecision | 'acquire' {
  if (existing?.status === 'completed' && existing.utcDay === utcDay) {
    return { action: 'skip', reason: 'already_completed' };
  }

  if (
    existing?.status === 'running' &&
    existing.utcDay === utcDay &&
    existing.token !== token &&
    Date.parse(existing.expiresAt) > now.getTime()
  ) {
    return { action: 'skip', reason: 'lease_held' };
  }

  return 'acquire';
}

export async function decideMarginSnapshotBatchLease(
  db: DbExecutor,
  token: string,
  now: Date = new Date(),
): Promise<MarginSnapshotBatchLeaseDecision> {
  const holderOrganizationId = await pickMarginSnapshotBatchLeaseHolderOrganizationId(db);
  if (!holderOrganizationId) {
    return { action: 'skip', reason: 'already_completed' };
  }

  return runLeaseTransaction(db, async (tx) => {
    await lockMarginSnapshotBatchLease(tx);

    const utcDay = utcDayKey(now);
    const existing = await readLeaseForUpdate(tx, holderOrganizationId);
    const decision = decideFromExistingLease(existing, utcDay, token, now);
    if (decision !== 'acquire') {
      return decision;
    }

    const startedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + RUNNING_LEASE_TTL_MS).toISOString();
    const next: MarginSnapshotBatchLeaseValue = {
      utcDay,
      status: 'running',
      token,
      startedAt,
      expiresAt,
    };
    await upsertOrganizationSettingValue(
      tx,
      holderOrganizationId,
      MARGIN_SNAPSHOT_BATCH_LEASE_SETTING_KEY,
      next,
    );

    return { action: 'run', holderOrganizationId, token };
  });
}

export async function markMarginSnapshotBatchCompleted(
  db: DbExecutor,
  holderOrganizationId: string,
  token: string,
  now: Date = new Date(),
): Promise<void> {
  await runLeaseTransaction(db, async (tx) => {
    await lockMarginSnapshotBatchLease(tx);

    const existing = await readLeaseForUpdate(tx, holderOrganizationId);
    if (!existing || existing.token !== token) return;

    const completed: MarginSnapshotBatchLeaseValue = {
      ...existing,
      status: 'completed',
      completedAt: now.toISOString(),
      expiresAt: now.toISOString(),
    };
    await upsertOrganizationSettingValue(
      tx,
      holderOrganizationId,
      MARGIN_SNAPSHOT_BATCH_LEASE_SETTING_KEY,
      completed,
    );
  });
}

export async function releaseMarginSnapshotBatchRunningLease(
  db: DbExecutor,
  holderOrganizationId: string,
  token: string,
): Promise<void> {
  await runLeaseTransaction(db, async (tx) => {
    await lockMarginSnapshotBatchLease(tx);

    const existing = await readLeaseForUpdate(tx, holderOrganizationId);
    if (!existing || existing.token !== token || existing.status !== 'running') return;

    await upsertOrganizationSettingValue(
      tx,
      holderOrganizationId,
      MARGIN_SNAPSHOT_BATCH_LEASE_SETTING_KEY,
      {
        ...existing,
        expiresAt: new Date(0).toISOString(),
      },
    );
  });
}
