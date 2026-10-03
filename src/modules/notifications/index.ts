/** Public API of the central notifications engine. Do not re-export UI from here. */

export {
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_DOMAINS,
  EVENT_DOMAIN,
  isNotificationSeverity,
  isNotificationEventType,
  DG_NOTIFICATION_EVENT_TYPES,
  isDgNotificationEventType,
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
  DgNotificationEventType,
} from './domain/types';
export {
  renderDgNotificationCopy,
  readDgNotificationMetadata,
  hasDgNotificationCopy,
} from './domain/dg-copy';
export type { DgCopyParams, DgNotificationMetadata } from './domain/dg-copy';
export { externalNotificationVisible } from './domain/external-visibility';

/** Contractor portal notification center (external principals; track R consumes these). */
export {
  listExternalNotifications,
  markExternalNotificationRead,
  markAllExternalNotificationsRead,
  unreadExternalCount,
} from './application/external-notifications';
export type {
  ExternalNotificationListItem,
  ListExternalNotificationsInput,
} from './application/external-notifications';

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
export { listUserIdsWithPermission } from './data/permission-holders.repository';
export { resolveNotificationsAsSystem } from './data/notifications.repository';

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
