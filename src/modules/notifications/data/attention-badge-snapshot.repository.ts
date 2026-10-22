import { eq, and, sql } from 'drizzle-orm';
import { notificationAttentionBadgeSnapshots } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

/**
 * Cache only a positive result. A missing relation is rechecked so applying
 * migration 0172 takes effect without a process restart.
 */
let snapshotRelationReady = false;

function sqlRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

/**
 * postgres.js rethrows any failed query after the transaction callback returns,
 * even when the caller attached `.catch`. `to_regclass` returns null when the
 * relation is absent, so the shell transaction is never aborted before 0172.
 */
async function attentionBadgeSnapshotRelationReady(db: DbExecutor): Promise<boolean> {
  if (snapshotRelationReady) return true;
  const rows = sqlRows<{ present: boolean }>(
    await db.execute(
      sql`select to_regclass('public.notification_attention_badge_snapshots') is not null as present`,
    ),
  );
  const ready = rows[0]?.present === true;
  if (ready) snapshotRelationReady = true;
  return ready;
}

export async function readAttentionBadgeSnapshot(
  db: DbExecutor,
  organizationId: string,
  userId: string,
): Promise<{ activeAttentionCount: number; updatedAt: Date } | null> {
  if (!(await attentionBadgeSnapshotRelationReady(db))) return null;
  const [row] = await db
    .select({
      activeAttentionCount: notificationAttentionBadgeSnapshots.activeAttentionCount,
      updatedAt: notificationAttentionBadgeSnapshots.updatedAt,
    })
    .from(notificationAttentionBadgeSnapshots)
    .where(
      and(
        eq(notificationAttentionBadgeSnapshots.organizationId, organizationId),
        eq(notificationAttentionBadgeSnapshots.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export interface ShellAttentionFigures {
  readonly persistedUnread: number;
  readonly snapshot: { readonly activeAttentionCount: number; readonly updatedAt: Date } | null;
  readonly unreadCreatedAfterSnapshot: number;
  readonly clearedAfterSnapshot: number;
}

/**
 * One round trip: live persisted unread plus the cached merged count and how
 * persisted rows moved since that cache was written. No Command Center collectors.
 */
export async function readShellAttentionFigures(
  db: DbExecutor,
  organizationId: string,
  userId: string,
): Promise<ShellAttentionFigures | null> {
  if (!(await attentionBadgeSnapshotRelationReady(db))) return null;
  const rows = sqlRows<{
    snapshot_count: number | null;
    snapshot_at: Date | string | null;
    persisted_unread: number | null;
    created_after: number | null;
    cleared_after: number | null;
  }>(
    await db.execute(sql`
      select
        snap.active_attention_count as snapshot_count,
        snap.updated_at as snapshot_at,
        (
          select count(*)::int
          from notifications n
          where n.organization_id = ${organizationId}::uuid
            and n.recipient_user_id = ${userId}::uuid
            and n.read_at is null
            and n.dismissed_at is null
            and n.resolved_at is null
            and (n.expires_at is null or n.expires_at > now())
        ) as persisted_unread,
        (
          select count(*)::int
          from notifications n
          where snap.updated_at is not null
            and n.organization_id = ${organizationId}::uuid
            and n.recipient_user_id = ${userId}::uuid
            and n.created_at > snap.updated_at
            and n.read_at is null
            and n.dismissed_at is null
            and n.resolved_at is null
            and (n.expires_at is null or n.expires_at > now())
        ) as created_after,
        (
          select count(*)::int
          from notifications n
          where snap.updated_at is not null
            and n.organization_id = ${organizationId}::uuid
            and n.recipient_user_id = ${userId}::uuid
            and n.created_at <= snap.updated_at
            and (
              n.read_at > snap.updated_at
              or n.resolved_at > snap.updated_at
              or n.dismissed_at > snap.updated_at
            )
        ) as cleared_after
      from (select 1) anchor
      left join notification_attention_badge_snapshots snap
        on snap.organization_id = ${organizationId}::uuid
       and snap.user_id = ${userId}::uuid
    `),
  );
  const row = rows[0];
  if (!row) return null;
  const snapshotAt = row.snapshot_at ? new Date(row.snapshot_at) : null;
  return {
    persistedUnread: Number(row.persisted_unread ?? 0),
    snapshot:
      row.snapshot_count == null || !snapshotAt || Number.isNaN(snapshotAt.getTime())
        ? null
        : { activeAttentionCount: Number(row.snapshot_count), updatedAt: snapshotAt },
    unreadCreatedAfterSnapshot: Number(row.created_after ?? 0),
    clearedAfterSnapshot: Number(row.cleared_after ?? 0),
  };
}

export async function upsertAttentionBadgeSnapshot(
  db: DbExecutor,
  organizationId: string,
  userId: string,
  activeAttentionCount: number,
): Promise<void> {
  if (!(await attentionBadgeSnapshotRelationReady(db))) return;
  const safe = Math.max(0, Math.floor(activeAttentionCount));
  await db
    .insert(notificationAttentionBadgeSnapshots)
    .values({
      organizationId,
      userId,
      activeAttentionCount: safe,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        notificationAttentionBadgeSnapshots.organizationId,
        notificationAttentionBadgeSnapshots.userId,
      ],
      set: {
        activeAttentionCount: safe,
        updatedAt: new Date(),
      },
    });
}
