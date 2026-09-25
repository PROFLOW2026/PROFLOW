/**
 * Locale labels for system payment-term catalog keys.
 * DB `name` stays English; UI overlays these labels by key.
 */

import type { Locale } from '@/shared/i18n/config';
import { resolveLabelLocale } from '@/shared/i18n/intl-locale';

export type PaymentTermLabelLocale = Locale;

/** Canonical English labels for system keys (aligned with DEFAULT_PAYMENT_TERMS). */
export const PAYMENT_TERM_LABELS_EN: Readonly<Record<string, string>> = {
  immediate: 'Immediate',
  net_7: 'Net 7',
  net_14: 'Net 14',
  net_30: 'Net 30',
  net_45: 'Net 45',
  net_60: 'Net 60',
  net_90: 'Net 90',
  net_120: 'Net 120',
  eom: 'End of month',
  eom_30: 'EOM + 30',
  eom_45: 'EOM + 45',
  eom_60: 'EOM + 60',
  eom_90: 'EOM + 90',
  eom_120: 'EOM + 120',
  milestone: 'Milestone-based',
  custom: 'Custom',
};

/** Hebrew customer-facing labels (שוטף = end of month / EOM family). */
export const PAYMENT_TERM_LABELS_HE: Readonly<Record<string, string>> = {
  immediate: 'מיידי',
  net_7: 'תוך 7 ימים',
  net_14: 'תוך 14 ימים',
  net_30: 'תוך 30 ימים',
  net_45: 'תוך 45 ימים',
  net_60: 'תוך 60 ימים',
  net_90: 'תוך 90 ימים',
  net_120: 'תוך 120 ימים',
  eom: 'שוטף',
  eom_30: 'שוטף + 30',
  eom_45: 'שוטף + 45',
  eom_60: 'שוטף + 60',
  eom_90: 'שוטף + 90',
  eom_120: 'שוטף + 120',
  milestone: 'לפי אבן דרך',
  custom: 'מותאם',
};

/** Israeli Arabic — practical construction/business wording. */
export const PAYMENT_TERM_LABELS_AR: Readonly<Record<string, string>> = {
  immediate: 'فوري',
  net_7: '7 أيام',
  net_14: '14 يوم',
  net_30: '30 يوم',
  net_45: '45 يوم',
  net_60: '60 يوم',
  net_90: '90 يوم',
  net_120: '120 يوم',
  eom: 'شهري',
  eom_30: 'شهري + 30',
  eom_45: 'شهري + 45',
  eom_60: 'شهري + 60',
  eom_90: 'شهري + 90',
  eom_120: 'شهري + 120',
  milestone: 'حسب مرحلة',
  custom: 'مخصص',
};

/** Russian — concise UI labels for Israeli users. */
export const PAYMENT_TERM_LABELS_RU: Readonly<Record<string, string>> = {
  immediate: 'Сразу',
  net_7: '7 дней',
  net_14: '14 дней',
  net_30: '30 дней',
  net_45: '45 дней',
  net_60: '60 дней',
  net_90: '90 дней',
  net_120: '120 дней',
  eom: 'Конец месяца',
  eom_30: 'КМ + 30',
  eom_45: 'КМ + 45',
  eom_60: 'КМ + 60',
  eom_90: 'КМ + 90',
  eom_120: 'КМ + 120',
  milestone: 'По этапам',
  custom: 'Свой',
};

const LABELS_BY_LOCALE: Readonly<Record<PaymentTermLabelLocale, Readonly<Record<string, string>>>> =
  {
    en: PAYMENT_TERM_LABELS_EN,
    'he-IL': PAYMENT_TERM_LABELS_HE,
    ar: PAYMENT_TERM_LABELS_AR,
    ru: PAYMENT_TERM_LABELS_RU,
  };

export function resolvePaymentTermLabelLocale(locale: string): PaymentTermLabelLocale {
  return resolveLabelLocale(locale);
}

/**
 * Map a known system catalog key to a locale label.
 * Unknown / custom keys fall back to the stored catalog `name`.
 */
export function localizePaymentTermName(
  key: string | null | undefined,
  fallbackName: string,
  locale: string,
): string {
  if (!key) return fallbackName;
  const labels = LABELS_BY_LOCALE[resolvePaymentTermLabelLocale(locale)];
  return labels[key] ?? fallbackName;
}

/** Localize payment-term options at list/map boundaries (drops `key` from the result). */
export function localizePaymentTermOptions(
  terms: readonly { id: string; key: string; name: string }[],
  locale: string,
): Array<{ id: string; name: string }> {
  return terms.map((term) => ({
    id: term.id,
    name: localizePaymentTermName(term.key, term.name, locale),
  }));
}
