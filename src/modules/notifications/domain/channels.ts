import type { NotificationRecord } from './types';

/**
 * Channel abstraction only. In-app is persisted rows; email/push are reserved
 * and must not send anything from this module.
 */

export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'push'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const ACTIVE_NOTIFICATION_CHANNELS = ['in_app'] as const satisfies readonly NotificationChannel[];

export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;
  /** Reserved. In-app delivery is the notifications row itself. */
  deliver(notification: NotificationRecord): Promise<void>;
}

export const inAppChannel: NotificationChannelAdapter = {
  channel: 'in_app',
  async deliver() {
    // Persistence via app.emit_notification is the in-app delivery.
  },
};

/** Intentionally unimplemented - do not wire SMTP or web-push here. */
export const emailChannel: NotificationChannelAdapter = {
  channel: 'email',
  async deliver() {
    return;
  },
};

/** Intentionally unimplemented - do not wire device push here. */
export const pushChannel: NotificationChannelAdapter = {
  channel: 'push',
  async deliver() {
    return;
  },
};
