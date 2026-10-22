import type { OrgContext } from '@/shared/auth/context';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  readShellAttentionFigures,
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
    // Non-query failures only. A missing 0172 relation is skipped inside the
    // repository; a failed query inside this transaction is rethrown by postgres.js.
  }
}

/**
 * Cached merged count, shifted by persisted rows created or cleared since the
 * cache was written. Command Center-only changes still wait for the next merge
 * (bell, Today, or a settling payment). No collectors run here.
 */
export function mergeShellAttentionCount(input: {
  readonly persistedUnread: number;
  readonly snapshot: { readonly activeAttentionCount: number } | null;
  readonly unreadCreatedAfterSnapshot: number;
  readonly clearedAfterSnapshot: number;
}): number {
  if (!input.snapshot) return input.persistedUnread;
  return Math.max(
    0,
    input.snapshot.activeAttentionCount +
      input.unreadCreatedAfterSnapshot -
      input.clearedAfterSnapshot,
  );
}

/** Cheap shell badge. One SQL when the snapshot table exists; otherwise persisted unread. */
export async function getShellNotificationBadgeCount(context: OrgContext): Promise<number> {
  assertPermission(context, PERMISSIONS.NOTIFICATIONS_READ);
  const figures = await readShellAttentionFigures(
    context.db,
    context.organizationId,
    context.userId,
  );
  if (!figures) {
    return countUnreadForRecipient(context.db, context.organizationId, context.userId);
  }
  return mergeShellAttentionCount(figures);
}

/** Rewrites the acting user's snapshot from the merged inbox. Not used on shell render. */
export async function refreshActorAttentionBadge(context: OrgContext): Promise<void> {
  if (!hasPermission(context, PERMISSIONS.NOTIFICATIONS_READ)) return;
  const { listMergedNotificationInbox } = await import('./actionable-inbox');
  await listMergedNotificationInbox(context);
}
