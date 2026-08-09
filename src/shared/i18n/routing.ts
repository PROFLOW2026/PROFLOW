import { defineRouting } from 'next-intl/routing';
import { DEFAULT_LOCALE, LOCALES } from './config';

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // Always prefixed so a URL is unambiguous about its language and direction,
  // which matters when a Hebrew user shares a link with an English colleague.
  localePrefix: 'always',
  // Do not invent `/en` from Accept-Language. Hebrew is the product default;
  // explicit `/en/...` URLs and the NEXT_LOCALE cookie still switch language.
  // Otherwise a Hebrew sign-up user with an English browser can bounce to /en
  // on bare paths (refresh, deep links without a prefix, post-auth `/`).
  localeDetection: false,
});
