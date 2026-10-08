import type { OrgContext } from '@/shared/auth/context';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  readAttentionBadgeSnapshot,
  upsertAttentionBadgeSnapshot,
} from '../data/attention-badge-snapshot.repository';
import { countUnreadForRecipient } from '../data/notifications.repository';

export { computeMergedAttentionCount } from './merged-inbox';

/**
 * Bell badge semantics: **active attention** count (merged inbox items with no readAt).
 * Command Center rows (`cc:*`) are always attention-required — mark-read does not persist for them.
 */
export async function persistAttentionBadgeSnapshot(
  context: OrgContext,
  activeAttentionCount: number,
): Promise<void> {
  if (!hasPermission(context, PERMISSIONS.NOTIFICATIONS_READ)) return;
  try {
    await upsertAttentionBadgeSnapshot(
      context.db,
      context.organizationId,
      context.userId,
      activeAttentionCount,
    );
  } catch {
    // Table may be absent until migration 0172 is applied.
  }
}

/** Cheap shell badge: cached merged attention when available, else persisted unread only. */
export async function getShellNotificationBadgeCount(context: OrgContext): Promise<number> {
  assertPermission(context, PERMISSIONS.NOTIFICATIONS_READ);
  const [persistedUnread, snapshot] = await Promise.all([
    countUnreadForRecipient(context.db, context.organizationId, context.userId),
    readAttentionBadgeSnapshot(context.db, context.organizationId, context.userId).catch(() => null),
  ]);
  if (snapshot) return snapshot.activeAttentionCount;
  return persistedUnread;
}
