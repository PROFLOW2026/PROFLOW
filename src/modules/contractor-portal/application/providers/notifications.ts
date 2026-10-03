import {
  listExternalNotifications,
  markAllExternalNotificationsRead,
  markExternalNotificationRead,
  unreadExternalCount,
  type ExternalNotificationListItem,
} from '@/modules/notifications';
import { EXTERNAL_CAPABILITIES as CAP, type ExternalContext } from '@/shared/external';
import { isolatedRead } from '../../data/isolate';
import type { PortalNotificationItem, PortalNotificationSource } from '../../domain/notifications';
import type { PortalSectionProvider } from '../../domain/sections';
import { BADGE, projectSet } from './shared';

const LIST_CAP = 50;

function readIsolated<T>(context: ExternalContext, fn: (context: ExternalContext) => Promise<T>): Promise<T> {
  return isolatedRead(context.db, (db) => fn({ ...context, db }));
}

function toPortalItem(item: ExternalNotificationListItem): PortalNotificationItem {
  return {
    id: item.id,
    title: item.title,
    body: item.body || null,
    href: item.deepLink,
    projectId: item.projectId,
    createdAt: item.lastOccurredAt.toISOString(),
    readAt: item.readAt ? item.readAt.toISOString() : null,
    severity: item.severity,
  };
}

/** Track T external notification center behind the portal port. */
export const externalNotificationSource: PortalNotificationSource = {
  async list(context, input) {
    const [items, unreadCount] = await readIsolated(context, async (scoped) => [
      await listExternalNotifications(scoped, { limit: Math.min(Math.max(input.limit, 1), LIST_CAP) }),
      await unreadExternalCount(scoped),
    ] as const);
    return { items: items.map(toPortalItem), unreadCount, nextCursor: null };
  },
  unreadCount: (context) => readIsolated(context, unreadExternalCount),
  markRead: (context, notificationId) => markExternalNotificationRead(context, notificationId),
  async markAllRead(context) {
    await markAllExternalNotificationsRead(context);
  },
};

export const recentNotificationsProvider: PortalSectionProvider = {
  id: 'notifications.unread',
  section: 'notifications',
  capability: CAP.PROJECT_VIEW,
  async load(context, scope) {
    const allowed = projectSet(scope.targets);
    const unread = (await listExternalNotifications(context, { limit: LIST_CAP, unreadOnly: true })).filter(
      (item) => item.projectId !== null && allowed.has(item.projectId),
    );
    return {
      count: unread.length,
      attentionCount: unread.filter((item) => item.severity === 'urgent').length,
      items: unread.slice(0, scope.limit).map((item) => ({
        id: item.id,
        projectId: item.projectId!,
        title: item.title,
        subtitle: item.body || null,
        statusKey: BADGE.unread,
        tone: item.severity === 'urgent' ? 'danger' : item.severity === 'warning' ? 'attention' : 'neutral',
        href: item.deepLink,
      })),
    };
  },
};
