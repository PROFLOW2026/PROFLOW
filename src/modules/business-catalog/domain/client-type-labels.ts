/**
 * Locale labels for system client_type catalog keys.
 * DB `name` stays English; UI overlays these labels by key.
 */

import type { Locale } from '@/shared/i18n/config';
import { resolveLabelLocale } from '@/shared/i18n/intl-locale';

export const CLIENT_TYPE_LABELS_EN: Readonly<Record<string, string>> = {
  private: 'Private',
  company: 'Company',
  developer: 'Developer',
  main_contractor: 'Main contractor',
  property_manager: 'Property manager',
  municipality: 'Municipality',
  government: 'Government / Public',
  institution: 'Institution',
  building_committee: 'Building committee',
  architect: 'Architect',
  facility_company: 'Facility company',
  other: 'Other',
};

export const CLIENT_TYPE_LABELS_HE: Readonly<Record<string, string>> = {
  private: 'פרטי',
  company: 'חברה',
  developer: 'יזם',
  main_contractor: 'קבלן ראשי',
  property_manager: 'מנהל נכסים',
  municipality: 'עירייה',
  government: 'ממשלה / ציבורי',
  institution: 'מוסד',
  building_committee: 'ועד בית',
  architect: 'אדריכל',
  facility_company: 'חברת ניהול מבנים',
  other: 'אחר',
};

export const CLIENT_TYPE_LABELS_AR: Readonly<Record<string, string>> = {
  private: 'خاص',
  company: 'شركة',
  developer: 'مطور',
  main_contractor: 'مقاول رئيسي',
  property_manager: 'مدير عقارات',
  municipality: 'بلدية',
  government: 'حكومة / عام',
  institution: 'مؤسسة',
  building_committee: 'لجنة المبنى',
  architect: 'مهندس معماري',
  facility_company: 'شركة إدارة مرافق',
  other: 'أخرى',
};

export const CLIENT_TYPE_LABELS_RU: Readonly<Record<string, string>> = {
  private: 'Частный',
  company: 'Компания',
  developer: 'Застройщик',
  main_contractor: 'Генеральный подрядчик',
  property_manager: 'Управляющий недвижимостью',
  municipality: 'Муниципалитет',
  government: 'Государство / госорган',
  institution: 'Учреждение',
  building_committee: 'Комитет дома',
  architect: 'Архитектор',
  facility_company: 'Управляющая компания',
  other: 'Другое',
};

const LABELS_BY_LOCALE: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en: CLIENT_TYPE_LABELS_EN,
  'he-IL': CLIENT_TYPE_LABELS_HE,
  ar: CLIENT_TYPE_LABELS_AR,
  ru: CLIENT_TYPE_LABELS_RU,
};

export function localizeClientTypeName(
  key: string | null | undefined,
  fallbackName: string,
  locale: string,
  isSystem = true,
): string {
  if (!key || !isSystem) return fallbackName;
  const labels = LABELS_BY_LOCALE[resolveLabelLocale(locale)];
  return labels[key] ?? fallbackName;
}

export function localizeClientTypeOptions(
  entries: readonly { id: string; key: string; name: string; isSystem?: boolean }[],
  locale: string,
): Array<{ id: string; name: string }> {
  return entries.map((entry) => ({
    id: entry.id,
    name: localizeClientTypeName(entry.key, entry.name, locale, entry.isSystem ?? true),
  }));
}
