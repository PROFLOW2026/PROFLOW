import { countUnreadForRecipient } from '../data/notifications.repository';
import type { NotificationInboxDto } from '../application/serialize';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotificationBell } from './notification-bell';

/**
 * Badge only. The count is the persisted unread notifications from the last
 * scan/emit. Opening the bell still loads the inbox. App shell must not run
 * Command Center collection or financial rollups to paint this badge.
 */
export async function NotificationBellLoader() {
  const initialInbox = await withOrgContext(async (context): Promise<NotificationInboxDto> => {
    if (!hasPermission(context, PERMISSIONS.NOTIFICATIONS_READ)) {
      return { items: [], unreadCount: 0 };
    }
    const unreadCount = await countUnreadForRecipient(
      context.db,
      context.organizationId,
      context.userId,
    );
    return { items: [], unreadCount };
  });
  return <NotificationBell initialInbox={initialInbox} />;
}
