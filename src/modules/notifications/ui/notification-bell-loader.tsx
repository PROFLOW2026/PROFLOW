import { listMergedNotificationInbox } from '../application/actionable-inbox';
import type { NotificationInboxDto } from '../application/serialize';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotificationBell } from './notification-bell';

/**
 * Initial bell badge uses the same merged inbox unread count as the drawer
 * (persisted notifications + Command Center actionable items).
 */
export async function NotificationBellLoader() {
  const initialInbox = await withOrgContext(async (context): Promise<NotificationInboxDto> => {
    if (!hasPermission(context, PERMISSIONS.NOTIFICATIONS_READ)) {
      return { items: [], unreadCount: 0 };
    }
    const merged = await listMergedNotificationInbox(context);
    return { items: [], unreadCount: merged.unreadCount };
  });
  return <NotificationBell initialInbox={initialInbox} />;
}
