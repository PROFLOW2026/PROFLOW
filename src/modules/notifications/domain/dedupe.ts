import type { NotificationEventType } from './types';

/**
 * Stable per-(org, recipient, condition) key. No clocks, locales, or titles.
 * SQL unique index: (organization_id, recipient_user_id, dedupe_key).
 */
export function buildDedupeKey(
  type: NotificationEventType,
  entityId: string,
  qualifier?: string,
): string {
  const id = entityId.trim();
  const extra = qualifier?.trim();
  return extra ? `${type}:${id}:${extra}` : `${type}:${id}`;
}
