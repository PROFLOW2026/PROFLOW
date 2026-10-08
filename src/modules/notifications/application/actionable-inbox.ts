import type { OrgContext } from '@/shared/auth/context';
import { getActionableInboxIfAllowed } from '@/modules/command-center/application/get-actionable-inbox';
import type { NotificationInbox } from '../domain/types';
import { listNotifications } from './list';
import { persistAttentionBadgeSnapshot } from './attention-badge';
import { buildMergedNotificationInbox } from './merged-inbox';

export {
  ACTIONABLE_NOTIFICATION_ID_PREFIX,
  commandCenterItemToNotificationItem,
  isActionableNotificationId,
} from './merged-inbox';

export async function listMergedNotificationInbox(context: OrgContext): Promise<NotificationInbox> {
  const [persisted, actionable] = await Promise.all([
    listNotifications(context),
    getActionableInboxIfAllowed(context),
  ]);

  const merged = buildMergedNotificationInbox(persisted, actionable);
  await persistAttentionBadgeSnapshot(context, merged.unreadCount);
  return merged;
}
