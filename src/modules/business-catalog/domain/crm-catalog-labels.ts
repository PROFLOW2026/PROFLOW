/**
 * Locale labels for CRM-related system catalog keys (lead_source, lost_reason, engagement_role).
 */

import type { Locale } from '@/shared/i18n/config';
import { resolveLabelLocale } from '@/shared/i18n/intl-locale';

type LabelMap = Readonly<Record<string, string>>;

const LEAD_SOURCE_EN: LabelMap = {
  referral: 'Referral',
  website: 'Website',
  walk_in: 'Walk-in',
  tender: 'Tender',
  repeat: 'Repeat customer',
  partner: 'Partner',
  other: 'Other',
};

const LEAD_SOURCE_HE: LabelMap = {
  referral: 'הפניה',
  website: 'אתר',
  walk_in: 'הגעה ישירה',
  tender: 'מכרז',
  repeat: 'לקוח חוזר',
  partner: 'שותף',
  other: 'אחר',
};

const LEAD_SOURCE_AR: LabelMap = {
  referral: 'إحالة',
  website: 'موقع',
  walk_in: 'زيارة مباشرة',
  tender: 'مناقصة',
  repeat: 'عميل متكرر',
  partner: 'شريك',
  other: 'أخرى',
};

const LEAD_SOURCE_RU: LabelMap = {
  referral: 'Рекомендация',
  website: 'Сайт',
  walk_in: 'Визит без записи',
  tender: 'Тендер',
  repeat: 'Повторный клиент',
  partner: 'Партнёр',
  other: 'Другое',
};

const LOST_REASON_EN: LabelMap = {
  price: 'Price',
  timing: 'Timing',
  competitor: 'Competitor',
  scope: 'Scope mismatch',
  no_budget: 'No budget',
  no_response: 'No response',
  other: 'Other',
};

const LOST_REASON_HE: LabelMap = {
  price: 'מחיר',
  timing: 'תזמון',
  competitor: 'מתחרה',
  scope: 'אי-התאמת היקף',
  no_budget: 'אין תקציב',
  no_response: 'ללא מענה',
  other: 'אחר',
};

const LOST_REASON_AR: LabelMap = {
  price: 'السعر',
  timing: 'التوقيت',
  competitor: 'منافس',
  scope: 'عدم تطابق النطاق',
  no_budget: 'لا ميزانية',
  no_response: 'لا رد',
  other: 'أخرى',
};

const LOST_REASON_RU: LabelMap = {
  price: 'Цена',
  timing: 'Сроки',
  competitor: 'Конкурент',
  scope: 'Несовпадение объёма',
  no_budget: 'Нет бюджета',
  no_response: 'Нет ответа',
  other: 'Другое',
};

const ENGAGEMENT_ROLE_EN: LabelMap = {
  supplier: 'Supplier',
  subcontractor: 'Subcontractor',
  consultant: 'Consultant',
  installer: 'Installer',
  maintenance: 'Maintenance',
};

const ENGAGEMENT_ROLE_HE: LabelMap = {
  supplier: 'ספק',
  subcontractor: 'קבלן משנה',
  consultant: 'יועץ',
  installer: 'מתקין',
  maintenance: 'תחזוקה',
};

const ENGAGEMENT_ROLE_AR: LabelMap = {
  supplier: 'مورد',
  subcontractor: 'مقاول باطن',
  consultant: 'استشاري',
  installer: 'مركّب',
  maintenance: 'صيانة',
};

const ENGAGEMENT_ROLE_RU: LabelMap = {
  supplier: 'Поставщик',
  subcontractor: 'Субподрядчик',
  consultant: 'Консультант',
  installer: 'Монтажник',
  maintenance: 'Обслуживание',
};

function resolveLabels(
  locale: string,
  maps: Readonly<Record<Locale, LabelMap>>,
): LabelMap {
  return maps[resolveLabelLocale(locale)];
}

const LEAD_SOURCE_BY_LOCALE: Readonly<Record<Locale, LabelMap>> = {
  en: LEAD_SOURCE_EN,
  'he-IL': LEAD_SOURCE_HE,
  ar: LEAD_SOURCE_AR,
  ru: LEAD_SOURCE_RU,
};

const LOST_REASON_BY_LOCALE: Readonly<Record<Locale, LabelMap>> = {
  en: LOST_REASON_EN,
  'he-IL': LOST_REASON_HE,
  ar: LOST_REASON_AR,
  ru: LOST_REASON_RU,
};

const ENGAGEMENT_ROLE_BY_LOCALE: Readonly<Record<Locale, LabelMap>> = {
  en: ENGAGEMENT_ROLE_EN,
  'he-IL': ENGAGEMENT_ROLE_HE,
  ar: ENGAGEMENT_ROLE_AR,
  ru: ENGAGEMENT_ROLE_RU,
};

function localizeSystemCatalogName(
  key: string | null | undefined,
  fallbackName: string,
  locale: string,
  isSystem: boolean,
  labels: LabelMap,
): string {
  if (!key || !isSystem) return fallbackName;
  return labels[key] ?? fallbackName;
}

function localizeSystemCatalogOptions(
  entries: readonly { id: string; key: string; name: string; isSystem?: boolean }[],
  locale: string,
  labels: LabelMap,
): Array<{ id: string; name: string }> {
  return entries.map((entry) => ({
    id: entry.id,
    name: localizeSystemCatalogName(
      entry.key,
      entry.name,
      locale,
      entry.isSystem ?? true,
      labels,
    ),
  }));
}

export function localizeLeadSourceName(
  key: string | null | undefined,
  fallbackName: string,
  locale: string,
  isSystem = true,
): string {
  return localizeSystemCatalogName(
    key,
    fallbackName,
    locale,
    isSystem,
    resolveLabels(locale, LEAD_SOURCE_BY_LOCALE),
  );
}

export function localizeLeadSourceOptions(
  entries: readonly { id: string; key: string; name: string; isSystem?: boolean }[],
  locale: string,
): Array<{ id: string; name: string }> {
  return localizeSystemCatalogOptions(entries, locale, resolveLabels(locale, LEAD_SOURCE_BY_LOCALE));
}

export function localizeLostReasonName(
  key: string | null | undefined,
  fallbackName: string,
  locale: string,
  isSystem = true,
): string {
  return localizeSystemCatalogName(
    key,
    fallbackName,
    locale,
    isSystem,
    resolveLabels(locale, LOST_REASON_BY_LOCALE),
  );
}

export function localizeLostReasonOptions(
  entries: readonly { id: string; key: string; name: string; isSystem?: boolean }[],
  locale: string,
): Array<{ id: string; name: string }> {
  return localizeSystemCatalogOptions(entries, locale, resolveLabels(locale, LOST_REASON_BY_LOCALE));
}

export function localizeEngagementRoleName(
  key: string | null | undefined,
  fallbackName: string,
  locale: string,
  isSystem = true,
): string {
  return localizeSystemCatalogName(
    key,
    fallbackName,
    locale,
    isSystem,
    resolveLabels(locale, ENGAGEMENT_ROLE_BY_LOCALE),
  );
}

export function localizeEngagementRoleOptions(
  entries: readonly { id: string; key: string; name: string; isSystem?: boolean }[],
  locale: string,
): Array<{ id: string; name: string }> {
  return localizeSystemCatalogOptions(
    entries,
    locale,
    resolveLabels(locale, ENGAGEMENT_ROLE_BY_LOCALE),
  );
}
