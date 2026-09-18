/**
 * Locale labels for system vendor_category capability keys (0070).
 * DB `name` may be English; UI overlays these labels by key for isSystem entries.
 */

import type { Locale } from '@/shared/i18n/config';
import { resolveLabelLocale } from '@/shared/i18n/intl-locale';

export type VendorCapabilityLabelLocale = Locale;

export const VENDOR_CAPABILITY_LABELS_EN: Readonly<Record<string, string>> = {
  materials_supplier: 'Materials supplier',
  equipment_supplier: 'Equipment supplier',
  equipment_rental: 'Equipment rental',
  service_provider: 'Service provider',
  subcontractor: 'Subcontractor',
  external_manpower: 'External manpower',
  consultant: 'Consultant',
  logistics: 'Logistics',
  landlord: 'Landlord',
  utility_provider: 'Utility provider',
  insurance_provider: 'Insurance provider',
  government: 'Government',
};

export const VENDOR_CAPABILITY_LABELS_HE: Readonly<Record<string, string>> = {
  materials_supplier: 'ספק חומרים',
  equipment_supplier: 'ספק ציוד',
  equipment_rental: 'השכרת ציוד',
  service_provider: 'נותן שירות',
  subcontractor: 'קבלן משנה',
  external_manpower: 'כוח אדם חיצוני',
  consultant: 'יועץ',
  logistics: 'לוגיסטיקה',
  landlord: 'משכיר',
  utility_provider: 'ספק שירותים',
  insurance_provider: 'ספק ביטוח',
  government: 'ממשלה / רשות',
};

export const VENDOR_CAPABILITY_LABELS_AR: Readonly<Record<string, string>> = {
  materials_supplier: 'مورد مواد',
  equipment_supplier: 'مورد معدات',
  equipment_rental: 'تأجير معدات',
  service_provider: 'مزود خدمة',
  subcontractor: 'مقاول باطن',
  external_manpower: 'قوة عاملة خارجية',
  consultant: 'استشاري',
  logistics: 'لوجستيات',
  landlord: 'مالك عقار',
  utility_provider: 'مزود مرافق',
  insurance_provider: 'مزود تأمين',
  government: 'جهة حكومية',
};

export const VENDOR_CAPABILITY_LABELS_RU: Readonly<Record<string, string>> = {
  materials_supplier: 'Поставщик материалов',
  equipment_supplier: 'Поставщик оборудования',
  equipment_rental: 'Аренда оборудования',
  service_provider: 'Поставщик услуг',
  subcontractor: 'Субподрядчик',
  external_manpower: 'Внешний персонал',
  consultant: 'Консультант',
  logistics: 'Логистика',
  landlord: 'Арендодатель',
  utility_provider: 'Поставщик коммунальных услуг',
  insurance_provider: 'Страховая компания',
  government: 'Госорган',
};

const LABELS_BY_LOCALE: Readonly<
  Record<VendorCapabilityLabelLocale, Readonly<Record<string, string>>>
> = {
  en: VENDOR_CAPABILITY_LABELS_EN,
  'he-IL': VENDOR_CAPABILITY_LABELS_HE,
  ar: VENDOR_CAPABILITY_LABELS_AR,
  ru: VENDOR_CAPABILITY_LABELS_RU,
};

export function resolveVendorCapabilityLabelLocale(locale: string): VendorCapabilityLabelLocale {
  return resolveLabelLocale(locale);
}

/**
 * Map a known system vendor_category capability key to a locale label.
 * Unknown / custom keys fall back to the stored catalog `name`.
 */
export function localizeVendorCategoryName(
  key: string | null | undefined,
  fallbackName: string,
  locale: string,
  isSystem = false,
): string {
  if (!key || !isSystem) return fallbackName;
  const labels = LABELS_BY_LOCALE[resolveVendorCapabilityLabelLocale(locale)];
  return labels[key] ?? fallbackName;
}

export function localizeVendorCategoryOptions(
  entries: readonly { id: string; key: string; name: string; isSystem?: boolean }[],
  locale: string,
): Array<{ id: string; key: string; name: string }> {
  return entries.map((entry) => ({
    id: entry.id,
    key: entry.key,
    name: localizeVendorCategoryName(entry.key, entry.name, locale, entry.isSystem ?? false),
  }));
}
