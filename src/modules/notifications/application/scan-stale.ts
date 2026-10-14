import type { OrgContext } from '@/shared/auth/context';
import type { NotificationEventType } from '../domain/types';
import {
  listUnresolvedEntityIdsForTypeAndEntityType,
  resolveNotificationsRpc,
} from '../data/notifications.repository';

/**
 * Resolves stale notifications for a single event type + entity type pair.
 * Prevents cross-domain resolve (e.g. planning vs UWM tasks sharing task_overdue).
 */
export async function resolveStaleNotificationsForEntityType(
  context: OrgContext,
  type: NotificationEventType,
  entityType: string,
  liveIds: ReadonlySet<string>,
): Promise<number> {
  const openIds = await listUnresolvedEntityIdsForTypeAndEntityType(
    context.db,
    context.organizationId,
    type,
    entityType,
  );
  let resolved = 0;
  for (const entityId of new Set(openIds)) {
    if (liveIds.has(entityId)) continue;
    resolved += await resolveNotificationsRpc(context.db, context.organizationId, type, entityId);
  }
  return resolved;
}
