import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { markAllNotificationsReadForRecipient } from '../data/notifications.repository';

export async function markAllNotificationsRead(context: OrgContext): Promise<number> {
  assertPermission(context, PERMISSIONS.NOTIFICATIONS_READ);
  return markAllNotificationsReadForRecipient(context.db, context.organizationId, context.userId);
}
