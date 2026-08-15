import type { NotificationInbox, NotificationListItem } from '../domain/types';

export interface NotificationListItemDto {
  readonly id: string;
  readonly type: NotificationListItem['type'];
  readonly domain: NotificationListItem['domain'];
  readonly title: string;
  readonly body: string;
  readonly severity: NotificationListItem['severity'];
  readonly deepLink: string | null;
  readonly readAt: string | null;
  readonly createdAt: string;
}

export interface NotificationInboxDto {
  readonly items: readonly NotificationListItemDto[];
  readonly unreadCount: number;
}

export function toNotificationListItemDto(item: NotificationListItem): NotificationListItemDto {
  return {
    id: item.id,
    type: item.type,
    domain: item.domain,
    title: item.title,
    body: item.body,
    severity: item.severity,
    deepLink: item.deepLink,
    readAt: item.readAt ? item.readAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
  };
}

export function toNotificationInboxDto(inbox: NotificationInbox): NotificationInboxDto {
  return {
    items: inbox.items.map(toNotificationListItemDto),
    unreadCount: inbox.unreadCount,
  };
}
