import { getPersistedNotificationUnreadCount } from '../application/unread-count';
import type { NotificationInboxDto } from '../application/serialize';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotificationBell } from './notification-bell';

/**
 * Shell badge uses persisted notifications only — never Command Center collectors.
 */
export async function NotificationBellLoader() {
  const initialInbox = await withOrgContext(async (context): Promise<NotificationInboxDto> => {
    if (!hasPermission(context, PERMISSIONS.NOTIFICATIONS_READ)) {
      return { items: [], unreadCount: 0 };
    }
    const unreadCount = await getPersistedNotificationUnreadCount(context);
    return { items: [], unreadCount };
  });
  return <NotificationBell initialInbox={initialInbox} />;
}
