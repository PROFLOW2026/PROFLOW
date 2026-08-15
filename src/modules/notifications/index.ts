/** Public API of the central notifications engine. Do not re-export UI from here. */

export {
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_DOMAINS,
  EVENT_DOMAIN,
  isNotificationSeverity,
  isNotificationEventType,
} from './domain/types';
export type {
  NotificationSeverity,
  NotificationEventType,
  NotificationDomain,
  NotificationRecord,
  NotificationListItem,
  NotificationInbox,
  EmitNotificationInput,
  NotificationScanResult,
} from './domain/types';

export { buildDedupeKey } from './domain/dedupe';
export { selectActorRecipients, NOTIFICATION_RECIPIENT_FANOUT_CAP } from './domain/recipients';
export {
  NOTIFICATION_CHANNELS,
  ACTIVE_NOTIFICATION_CHANNELS,
  inAppChannel,
  emailChannel,
  pushChannel,
} from './domain/channels';
export type { NotificationChannel, NotificationChannelAdapter } from './domain/channels';
export { isUnreadNotification, isActiveNotification } from './domain/unread';
export { applyEmitUpsert } from './domain/upsert';
export type { EmittedNotificationState, EmitUpsertPatch } from './domain/upsert';
export { notificationCopy } from './domain/copy';

export { emitNotification } from './application/emit';
export { listNotifications } from './application/list';
export { markNotificationRead } from './application/mark-read';
export { markAllNotificationsRead } from './application/mark-all-read';
export { runNotificationScan } from './application/scan-conditions';

export {
  notificationIdSchema,
  listNotificationsSchema,
  runNotificationScanSchema,
  emitNotificationSchema,
} from './validation/schemas';
export type {
  MarkNotificationReadInput,
  ListNotificationsInput,
  RunNotificationScanInput,
} from './validation/schemas';
