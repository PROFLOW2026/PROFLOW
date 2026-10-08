import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { countUnreadForRecipient } from '../data/notifications.repository';

/** Cheap persisted-notification unread count for shell chrome (no Command Center). */
export async function getPersistedNotificationUnreadCount(context: OrgContext): Promise<number> {
  assertPermission(context, PERMISSIONS.NOTIFICATIONS_READ);
  return countUnreadForRecipient(context.db, context.organizationId, context.userId);
}
