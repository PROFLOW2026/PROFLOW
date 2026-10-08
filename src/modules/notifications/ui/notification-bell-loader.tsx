import { getShellNotificationBadgeCount } from '../application/attention-badge';
import type { NotificationInboxDto } from '../application/serialize';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotificationBell } from './notification-bell';

/**
 * Shell badge reads cached active-attention snapshot (no Command Center collectors on render).
 */
export async function NotificationBellLoader() {
  const initialInbox = await withOrgContext(async (context): Promise<NotificationInboxDto> => {
    if (!hasPermission(context, PERMISSIONS.NOTIFICATIONS_READ)) {
      return { items: [], unreadCount: 0 };
    }
    const unreadCount = await getShellNotificationBadgeCount(context);
    return { items: [], unreadCount };
  });
  return <NotificationBell initialInbox={initialInbox} />;
}
