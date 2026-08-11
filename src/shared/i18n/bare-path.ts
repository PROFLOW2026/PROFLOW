import { DEFAULT_LOCALE, isLocale, type Locale } from './config';

/**
 * How a locale-unprefixed path should be localized.
 *
 * `localePrefix: 'always'` keeps shareable URLs prefixed, so `/sign-in` still
 * redirects. The PWA `start_url` is `/` — a redirect there adds a second
 * document hop (and used to also refresh Auth) before the installed-app splash
 * can dismiss. The root is therefore rewritten in one request.
 */
export type BarePathLocalization = 'passthrough' | 'rewrite-root' | 'redirect';

export function barePathLocalization(pathname: string): BarePathLocalization {
  const segment = pathname.split('/').filter(Boolean)[0];
  if (isLocale(segment)) return 'passthrough';
  if (pathname === '/' || pathname === '') return 'rewrite-root';
  return 'redirect';
}

/** Locale-prefix redirects must not call Auth — the follow-up document request does. */
export function shouldRefreshSessionOnBarePath(kind: BarePathLocalization): boolean {
  return kind !== 'redirect';
}

export function localeFromCookieValue(value: string | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function prefixedPathname(pathname: string, locale: Locale): string {
  if (pathname === '/' || pathname === '') return `/${locale}`;
  return `/${locale}${pathname}`;
}
