import type { ExternalContext } from '@/shared/external';

/**
 * External notification center port. Track T (notifications) implements it for external
 * principals (grant holders of the vendor/agreement); the portal only renders it.
 */
export interface PortalNotificationItem {
  readonly id: string;
  readonly title: string;
  readonly body: string | null;
  /** Portal path (`/contractor/...`) of an implemented route, or null. */
  readonly href: string | null;
  readonly projectId: string | null;
  /** ISO timestamp. */
  readonly createdAt: string;
  readonly readAt: string | null;
  readonly severity: 'info' | 'warning' | 'urgent';
}

export interface PortalNotificationPage {
  readonly items: readonly PortalNotificationItem[];
  readonly unreadCount: number;
  readonly nextCursor: string | null;
}

export interface PortalNotificationSource {
  list(
    context: ExternalContext,
    input: { readonly limit: number; readonly cursor?: string | null },
  ): Promise<PortalNotificationPage>;
  unreadCount(context: ExternalContext): Promise<number>;
  markRead(context: ExternalContext, notificationId: string): Promise<void>;
  markAllRead(context: ExternalContext): Promise<void>;
}
