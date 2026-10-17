import { DEFAULT_LOCALE, isLocale, type Locale } from './config';

/**
 * How a locale-unprefixed path should be localized.
 *
 * `localePrefix: 'always'` keeps shareable URLs prefixed, so `/sign-in` still
 * redirects. The PWA `start_url` is `/` - a redirect there adds a second
 * document hop (and used to also refresh Auth) before the installed-app splash
 * can dismiss. The root is therefore rewritten in one request.
 */
export type BarePathLocalization = 'passthrough' | 'rewrite-root' | 'redirect';

/** `public/` roots that must not receive a locale prefix (workers, WASM, CAD bundles). */
const PUBLIC_ASSET_ROOTS = new Set([
  'pf-cad',
  'cad',
  'cad-workers',
  'icons',
  'pdf.worker.min.mjs',
  'sw.js',
  'manifest.webmanifest',
]);

export function barePathLocalization(pathname: string): BarePathLocalization {
  const segment = pathname.split('/').filter(Boolean)[0];
  if (isLocale(segment)) return 'passthrough';
  if (pathname === '/' || pathname === '') return 'rewrite-root';
  if (segment && PUBLIC_ASSET_ROOTS.has(segment)) return 'passthrough';
  return 'redirect';
}

/** Locale-prefix redirects must not call Auth - the follow-up document request does. */
export function shouldRefreshSessionOnBarePath(kind: BarePathLocalization): boolean {
  return kind !== 'redirect';
}

export function localeFromCookieValue(value: string | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** First path segment when it is a supported locale (`/en/...`). */
export function localeFromPathname(pathname: string): Locale | null {
  const segment = pathname.split('?')[0]?.split('#')[0]?.split('/').filter(Boolean)[0];
  return isLocale(segment) ? segment : null;
}

/**
 * Document `lang`/`dir` follow the URL locale when the path has one.
 * The cookie is only the fallback for bare paths such as `/`.
 */
export function documentLocale(pathname: string, cookieValue: string | undefined): Locale {
  return localeFromPathname(pathname) ?? localeFromCookieValue(cookieValue);
}

export function prefixedPathname(pathname: string, locale: Locale): string {
  if (pathname === '/' || pathname === '') return `/${locale}`;
  return `/${locale}${pathname}`;
}
