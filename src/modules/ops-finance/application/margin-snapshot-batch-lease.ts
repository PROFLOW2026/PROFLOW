import 'server-only';

import { asc, isNull } from 'drizzle-orm';
import { organizations } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import {
  getOrganizationSettingValue,
  upsertOrganizationSettingValue,
} from '@/modules/tenancy';

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

export async function decideMarginSnapshotBatchLease(
  db: DbExecutor,
  token: string,
  now: Date = new Date(),
): Promise<MarginSnapshotBatchLeaseDecision> {
  const holderOrganizationId = await pickMarginSnapshotBatchLeaseHolderOrganizationId(db);
  if (!holderOrganizationId) {
    return { action: 'skip', reason: 'already_completed' };
  }

  const utcDay = utcDayKey(now);
  const existing = parseLease(
    await getOrganizationSettingValue<unknown>(
      db,
      holderOrganizationId,
      MARGIN_SNAPSHOT_BATCH_LEASE_SETTING_KEY,
    ),
  );

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
    db,
    holderOrganizationId,
    MARGIN_SNAPSHOT_BATCH_LEASE_SETTING_KEY,
    next,
  );

  return { action: 'run', holderOrganizationId, token };
}

export async function markMarginSnapshotBatchCompleted(
  db: DbExecutor,
  holderOrganizationId: string,
  token: string,
  now: Date = new Date(),
): Promise<void> {
  const existing = parseLease(
    await getOrganizationSettingValue<unknown>(
      db,
      holderOrganizationId,
      MARGIN_SNAPSHOT_BATCH_LEASE_SETTING_KEY,
    ),
  );
  if (!existing || existing.token !== token) return;

  const completed: MarginSnapshotBatchLeaseValue = {
    ...existing,
    status: 'completed',
    completedAt: now.toISOString(),
    expiresAt: now.toISOString(),
  };
  await upsertOrganizationSettingValue(
    db,
    holderOrganizationId,
    MARGIN_SNAPSHOT_BATCH_LEASE_SETTING_KEY,
    completed,
  );
}

export async function releaseMarginSnapshotBatchRunningLease(
  db: DbExecutor,
  holderOrganizationId: string,
  token: string,
): Promise<void> {
  const existing = parseLease(
    await getOrganizationSettingValue<unknown>(
      db,
      holderOrganizationId,
      MARGIN_SNAPSHOT_BATCH_LEASE_SETTING_KEY,
    ),
  );
  if (!existing || existing.token !== token || existing.status !== 'running') return;

  await upsertOrganizationSettingValue(
    db,
    holderOrganizationId,
    MARGIN_SNAPSHOT_BATCH_LEASE_SETTING_KEY,
    {
      ...existing,
      expiresAt: new Date(0).toISOString(),
    },
  );
}
