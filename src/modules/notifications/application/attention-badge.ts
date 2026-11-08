import { withExecutor, type OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  readShellAttentionFigures,
  upsertAttentionBadgeSnapshot,
} from '../data/attention-badge-snapshot.repository';
import { countUnreadForRecipient } from '../data/notifications.repository';

export { computeMergedAttentionCount } from './merged-inbox';

type TransactionCapableDb = DbExecutor & {
  transaction: <T>(fn: (tx: DbExecutor) => Promise<T>) => Promise<T>;
};

function asTransactionCapable(db: DbExecutor): TransactionCapableDb {
  return db as TransactionCapableDb;
}

/**
 * Bell badge semantics: **active attention** count (merged inbox items with no readAt).
 * `cc:*` rows are not notification records. Mark-read does not persist for them.
 * They stay in this actor's snapshot only while the merged inbox still includes them.
 */
function isSnapshotPermissionDenied(error: unknown): boolean {
  const candidates = [error];
  if (error && typeof error === 'object' && 'cause' in error) {
    candidates.push((error as { cause?: unknown }).cause);
  }
  return candidates.some((candidate) => {
    if (!candidate || typeof candidate !== 'object' || !('code' in candidate)) return false;
    return String((candidate as { code?: unknown }).code) === '42501';
  });
}

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
  } catch (error) {
    // A 42501 from the badge RLS rolls back only the savepoint. Any other failure still surfaces.
    if (!isSnapshotPermissionDenied(error)) throw error;
  }
}

/**
 * Cached merged count, shifted by persisted rows created or cleared since the
 * cache was written. `cc:*` rows are not in `notifications`, so this delta
 * cannot clear them. Actor Command Center changes rewrite this user's snapshot
 * instead. No collectors run here.
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

/**
 * Rewrites the acting user's snapshot from the merged inbox. Not used on shell
 * render. The recompute runs in a savepoint on context.db (the caller RLS
 * transaction, never the service role) and writes only context.userId.
 * `cc:*` rows that are no longer in the inbox leave the count.
 */
export async function refreshActorAttentionBadge(context: OrgContext): Promise<void> {
  if (!hasPermission(context, PERMISSIONS.NOTIFICATIONS_READ)) return;
  try {
    await asTransactionCapable(context.db).transaction(async (tx) => {
      const { listMergedNotificationInbox } = await import('./actionable-inbox');
      await listMergedNotificationInbox(withExecutor(context, tx));
    });
  } catch {
    // Best-effort. The caller's transaction (item state, payment) stays usable.
  }
}
