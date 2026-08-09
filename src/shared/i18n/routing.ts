import { defineRouting } from 'next-intl/routing';
import { DEFAULT_LOCALE, LOCALES } from './config';

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // Always prefixed so a URL is unambiguous about its language and direction,
  // which matters when a Hebrew user shares a link with an English colleague.
  localePrefix: 'always',
  localeDetection: true,
});
