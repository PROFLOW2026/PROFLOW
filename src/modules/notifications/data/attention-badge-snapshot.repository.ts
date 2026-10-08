import { eq, and } from 'drizzle-orm';
import { notificationAttentionBadgeSnapshots } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export async function readAttentionBadgeSnapshot(
  db: DbExecutor,
  organizationId: string,
  userId: string,
): Promise<{ activeAttentionCount: number; updatedAt: Date } | null> {
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
