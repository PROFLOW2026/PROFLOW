import type { NamespaceTranslator } from '@/shared/i18n/namespace-translator';
import {
  captureNeedsReviewNotificationCopy,
  materialPressureAlertNotificationCopy,
  type CaptureNotificationVariant,
  type MaterialPressureAlertReason,
  type MaterialPressureAlertTrade,
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

function isMaterialPressureTrade(value: unknown): value is MaterialPressureAlertTrade {
  return (
    value === 'electrical' ||
    value === 'plumbing' ||
    value === 'steel_rebar' ||
    value === 'concrete'
  );
}

function materialPressureReasonFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  title: string,
): MaterialPressureAlertReason {
  if (metadata?.reason === 'high_pressure' || metadata?.reason === 'significant_delta') {
    return metadata.reason;
  }
  const normalized = title.trim().toLowerCase();
  if (normalized.includes('high material pressure')) return 'high_pressure';
  return 'significant_delta';
}

function materialPressureTradeFromLegacyTitle(title: string): MaterialPressureAlertTrade | null {
  const normalized = title.toLowerCase();
  if (normalized.includes('steel') || normalized.includes('rebar')) return 'steel_rebar';
  if (normalized.includes('electrical')) return 'electrical';
  if (normalized.includes('plumbing')) return 'plumbing';
  if (normalized.includes('concrete') || normalized.includes('cement')) return 'concrete';
  return null;
}

function materialPressureScoreFromLegacyTitle(title: string): number | null {
  const match = title.match(/\((\d+)\s*\/\s*100\)/);
  if (!match?.[1]) return null;
  const score = Number(match[1]);
  return Number.isFinite(score) ? score : null;
}

function localizeMaterialPressureAlert(
  item: NotificationListItem,
  t: NamespaceTranslator,
): NotificationListItem {
  const metadata = item.metadata;
  const tradeFromMetadata = metadata?.trade;
  const trade =
    typeof tradeFromMetadata === 'string' && isMaterialPressureTrade(tradeFromMetadata)
      ? tradeFromMetadata
      : materialPressureTradeFromLegacyTitle(item.title);

  const scoreRaw = metadata?.score;
  const score =
    typeof scoreRaw === 'number'
      ? Math.round(scoreRaw)
      : (materialPressureScoreFromLegacyTitle(item.title) ?? 0);

  const deltaRaw = metadata?.delta;
  const delta = typeof deltaRaw === 'number' ? deltaRaw : null;

  if (!trade) return item;

  const copy = materialPressureAlertNotificationCopy(t, {
    trade,
    score,
    delta,
    reason: materialPressureReasonFromMetadata(metadata, item.title),
  });

  return { ...item, title: copy.title, body: copy.body };
}

export function localizeNotificationListItem(
  item: NotificationListItem,
  t: NamespaceTranslator,
): NotificationListItem {
  if (item.type === 'material_pressure_alert') {
    return localizeMaterialPressureAlert(item, t);
  }

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
