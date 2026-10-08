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
