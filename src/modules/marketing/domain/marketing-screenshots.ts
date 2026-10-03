import { isLocale } from '@/shared/i18n/config';

/** Locales that have dedicated marketing screenshot directories under `public/`. */
export const MARKETING_SCREENSHOT_LOCALES = ['he-IL', 'en', 'ar', 'ru'] as const;

export type MarketingScreenshotLocale = (typeof MARKETING_SCREENSHOT_LOCALES)[number];

export function marketingScreenshotLocale(locale: string): MarketingScreenshotLocale {
  if (locale === 'he-IL' || locale === 'en' || locale === 'ar' || locale === 'ru') {
    return locale;
  }
  return isLocale(locale) ? (locale as MarketingScreenshotLocale) : 'he-IL';
}

/** Public URL for a locale-specific marketing screenshot PNG. */
export function marketingScreenshotSrc(locale: string, filename: string): string {
  const folder = marketingScreenshotLocale(locale);
  const name = filename.replace(/^\//, '');
  return `/marketing/screenshots/${folder}/${name}`;
}

export type MarketingTourTabConfig = {
  id: string;
  label: string;
  caption: string;
  file: string;
  alt: string;
};

export function resolveTourTabSrc(locale: string, tab: MarketingTourTabConfig): string {
  return marketingScreenshotSrc(locale, tab.file);
}
