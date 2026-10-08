import type { OrgContext } from '@/shared/auth/context';
import { getShellNotificationBadgeCount } from './attention-badge';

/** @deprecated Use getShellNotificationBadgeCount — includes cached active-attention snapshot. */
export async function getPersistedNotificationUnreadCount(context: OrgContext): Promise<number> {
  return getShellNotificationBadgeCount(context);
}
