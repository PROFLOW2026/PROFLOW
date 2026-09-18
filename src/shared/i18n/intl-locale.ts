import { isLocale, type Locale } from './config';

/**
 * Israeli Arabic UI: Arabic text and RTL with Latin digits (ProjectFlow convention).
 * @see https://unicode.org/reports/tr35/#Unicode_locale_identifier
 */
export const ARABIC_LATIN_DIGITS_INTL_LOCALE = 'ar-IL-u-nu-latn';

/**
 * Whether the UI locale is Hebrew (product `he-IL` or BCP-47 Hebrew tags).
 */
export function isHebrewLocale(locale: string | null | undefined): boolean {
  const value = locale ?? '';
  if (value === 'he-IL' || value.startsWith('he')) return true;
  const base = value.toLowerCase().split('-')[0];
  return base === 'he' || base === 'iw';
}

/** Arabic UI locale (`ar` route or BCP-47 Arabic tags). */
export function isArabicLocale(locale: string | null | undefined): boolean {
  const value = locale ?? '';
  if (value === 'ar') return true;
  const base = value.toLowerCase().split('-')[0];
  return base === 'ar';
}

/** Russian UI locale (`ru` route or BCP-47 Russian tags). */
export function isRussianLocale(locale: string | null | undefined): boolean {
  const value = locale ?? '';
  if (value === 'ru') return true;
  const base = value.toLowerCase().split('-')[0];
  return base === 'ru';
}

/**
 * Map ProjectFlow route locale to a BCP-47 tag for Intl date/number/currency formatters.
 * Language affects presentation only — org/country still drives ILS, VAT, and business rules.
 */
export function resolveIntlLocale(locale: string): string {
  if (isHebrewLocale(locale)) return 'he-IL';
  if (isArabicLocale(locale)) return ARABIC_LATIN_DIGITS_INTL_LOCALE;
  if (isRussianLocale(locale)) {
    try {
      Intl.getCanonicalLocales('ru-IL');
      return 'ru-IL';
    } catch {
      return 'ru-RU';
    }
  }
  return 'en-GB';
}

/**
 * Locale tag for time-of-day formatters (hour/minute labels).
 */
export function resolveIntlTimeLocale(locale: string): string {
  if (isHebrewLocale(locale)) return 'he-IL';
  if (isArabicLocale(locale)) return ARABIC_LATIN_DIGITS_INTL_LOCALE;
  if (isRussianLocale(locale)) return 'ru';
  return 'en';
}

const LATIN_DIGITS = { numberingSystem: 'latn' as const };

/** Latin digits for Arabic route locale; no-op for other locales. */
export function arabicLatinDigitFormatOptions(
  locale: string,
): typeof LATIN_DIGITS | Record<string, never> {
  return isArabicLocale(locale) ? LATIN_DIGITS : {};
}

/** next-intl preset formats — Arabic keeps Latin digits without changing route locale. */
export function buildNextIntlFormats(locale: string) {
  const latn = arabicLatinDigitFormatOptions(locale);
  return {
    dateTime: {
      short: { year: 'numeric' as const, month: '2-digit' as const, day: '2-digit' as const, ...latn },
      medium: { year: 'numeric' as const, month: 'short' as const, day: 'numeric' as const, ...latn },
    },
    number: {
      tabular: { useGrouping: true, ...latn },
    },
  };
}

/** Intl date/time formatter — always routes Arabic through Latin digits. */
export function intlDateTimeFormat(
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    ...arabicLatinDigitFormatOptions(locale),
    ...options,
  });
}

/** Normalize any locale string to a supported product locale. */
export function resolveLabelLocale(locale: string): Locale {
  if (isLocale(locale)) return locale;
  if (isHebrewLocale(locale)) return 'he-IL';
  if (isArabicLocale(locale)) return 'ar';
  if (isRussianLocale(locale)) return 'ru';
  return 'en';
}
