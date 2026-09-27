import type { NamespaceTranslator } from '@/shared/i18n/namespace-translator';
import {
  captureNeedsReviewNotificationCopy,
  type CaptureNotificationVariant,
} from '../domain/copy';
import type { NotificationInbox, NotificationListItem } from '../domain/types';

function captureVariantFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): CaptureNotificationVariant {
  const raw = metadata?.captureVariant;
  if (
    raw === 'field_media' ||
    raw === 'financial_document' ||
    raw === 'video' ||
    raw === 'default'
  ) {
    return raw;
  }
  return 'default';
}

function captureVariantFromLegacyTitle(title: string): CaptureNotificationVariant {
  const normalized = title.trim().toLowerCase();
  if (normalized.includes('field capture')) return 'field_media';
  if (normalized.includes('financial capture')) return 'financial_document';
  if (normalized.includes('quick capture')) return 'default';
  return 'default';
}

export function localizeNotificationListItem(
  item: NotificationListItem,
  t: NamespaceTranslator,
): NotificationListItem {
  if (item.type !== 'capture_needs_review') return item;

  const variant = item.metadata?.captureVariant
    ? captureVariantFromMetadata(item.metadata)
    : captureVariantFromLegacyTitle(item.title);

  const ownerNote =
    typeof item.metadata?.ownerNote === 'string' ? item.metadata.ownerNote : null;

  const copy = captureNeedsReviewNotificationCopy(t, variant, ownerNote);
  return { ...item, title: copy.title, body: copy.body };
}

export function localizeNotificationInbox(
  inbox: NotificationInbox,
  t: NamespaceTranslator,
): NotificationInbox {
  return {
    unreadCount: inbox.unreadCount,
    items: inbox.items.map((item) => localizeNotificationListItem(item, t)),
  };
}
