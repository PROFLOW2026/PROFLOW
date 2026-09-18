import { isLocale, type Locale } from './config';

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
  if (isArabicLocale(locale)) return 'ar-IL';
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
  if (isArabicLocale(locale)) return 'ar';
  if (isRussianLocale(locale)) return 'ru';
  return 'en';
}

/** Normalize any locale string to a supported product locale. */
export function resolveLabelLocale(locale: string): Locale {
  if (isLocale(locale)) return locale;
  if (isHebrewLocale(locale)) return 'he-IL';
  if (isArabicLocale(locale)) return 'ar';
  if (isRussianLocale(locale)) return 'ru';
  return 'en';
}
