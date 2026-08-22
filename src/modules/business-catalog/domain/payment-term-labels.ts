/**
 * Locale labels for system payment-term catalog keys.
 * DB `name` stays English; UI overlays these labels by key.
 */

export type PaymentTermLabelLocale = 'en' | 'he-IL';

/** Canonical English labels for system keys (aligned with DEFAULT_PAYMENT_TERMS). */
export const PAYMENT_TERM_LABELS_EN: Readonly<Record<string, string>> = {
  immediate: 'Immediate',
  net_7: 'Net 7',
  net_14: 'Net 14',
  net_30: 'Net 30',
  net_45: 'Net 45',
  net_60: 'Net 60',
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
  eom: 'שוטף',
  eom_30: 'שוטף + 30',
  eom_45: 'שוטף + 45',
  eom_60: 'שוטף + 60',
  eom_90: 'שוטף + 90',
  eom_120: 'שוטף + 120',
  milestone: 'לפי אבן דרך',
  custom: 'מותאם',
};

const LABELS_BY_LOCALE: Readonly<Record<PaymentTermLabelLocale, Readonly<Record<string, string>>>> =
  {
    en: PAYMENT_TERM_LABELS_EN,
    'he-IL': PAYMENT_TERM_LABELS_HE,
  };

export function resolvePaymentTermLabelLocale(locale: string): PaymentTermLabelLocale {
  return locale === 'he-IL' || locale.startsWith('he') ? 'he-IL' : 'en';
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
