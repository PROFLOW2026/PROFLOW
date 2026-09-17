import { type Locale } from './config';

/**
 * Whether the UI locale is Hebrew (product `he-IL` or BCP-47 Hebrew tags).
 */
export function isHebrewLocale(locale: string | null | undefined): boolean {
  const value = locale ?? '';
  if (value === 'he-IL' || value.startsWith('he')) return true;
  const base = value.toLowerCase().split('-')[0];
  return base === 'he' || base === 'iw';
}

/**
 * Map ProjectFlow route locale to a BCP-47 tag for Intl date/number/currency formatters.
 * English UI uses `en-GB` for DD/MM/YYYY alignment with Israeli business convention.
 */
export function resolveIntlLocale(locale: string): string {
  return isHebrewLocale(locale) ? 'he-IL' : 'en-GB';
}

/**
 * Locale tag for time-of-day formatters (hour/minute labels).
 * Uses plain `en` for English; Hebrew stays `he-IL`.
 */
export function resolveIntlTimeLocale(locale: string): string {
  return isHebrewLocale(locale) ? 'he-IL' : 'en';
}

/** Normalize any locale string to the product label locale (`en` | `he-IL`). */
export function resolveLabelLocale(locale: string): Locale {
  return isHebrewLocale(locale) ? 'he-IL' : 'en';
}
