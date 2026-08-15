import type { NotificationRecord } from './types';

type UnreadFields = Pick<
  NotificationRecord,
  'readAt' | 'dismissedAt' | 'resolvedAt' | 'expiresAt'
>;

/**
 * Unread inbox membership: not read, not dismissed, not resolved, not expired.
 */
export function isUnreadNotification(row: UnreadFields, now: Date = new Date()): boolean {
  if (row.readAt) return false;
  if (row.dismissedAt) return false;
  if (row.resolvedAt) return false;
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/** Bell list: still relevant (not dismissed / resolved / expired). Read items may remain. */
export function isActiveNotification(row: UnreadFields, now: Date = new Date()): boolean {
  if (row.dismissedAt) return false;
  if (row.resolvedAt) return false;
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}
