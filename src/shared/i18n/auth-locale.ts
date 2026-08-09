import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from './config';

/** Matches next-intl's default locale cookie name. */
export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

/**
 * Resolve the UI locale for auth callbacks and email return URLs.
 * Prefer an explicit query/cookie/metadata value; never invent `en` from
 * Accept-Language (that header is ignored here on purpose).
 */
export function resolveAuthLocale(
  candidates: Array<string | null | undefined>,
): Locale {
  for (const candidate of candidates) {
    if (isLocale(candidate)) return candidate;
  }
  return DEFAULT_LOCALE;
}

/** Read locale_preference written at sign-up into Supabase user_metadata. */
export function localeFromAuthMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Locale | null {
  const value = metadata?.locale_preference;
  return typeof value === 'string' && isLocale(value) ? value : null;
}

/** Remove a leading supported locale segment so navigation APIs do not double-prefix. */
export function stripLocalePrefix(path: string): string {
  for (const locale of LOCALES) {
    const prefix = `/${locale}`;
    if (path === prefix) return '/';
    if (path.startsWith(`${prefix}/`)) {
      const rest = path.slice(prefix.length);
      return rest.length > 0 ? rest : '/';
    }
  }
  return path;
}

/**
 * Only same-site, path-relative destinations survive. Absolute URLs and
 * protocol-relative `//host` values are dropped.
 */
export function safeAppPath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return stripLocalePrefix(value);
}

/** Build `/auth/callback` with an explicit locale so email links survive cross-device opens. */
export function buildAuthCallbackUrl(
  origin: string,
  locale: Locale,
  next?: string | null,
): string {
  const url = new URL('/auth/callback', origin.endsWith('/') ? origin : `${origin}/`);
  url.searchParams.set('locale', locale);
  const safeNext = next ? safeAppPath(next) : null;
  if (safeNext && safeNext !== '/') {
    url.searchParams.set('next', safeNext);
  }
  return url.toString();
}

/** Prefix an in-app path with a validated locale, preserving a query string if present. */
export function joinLocalizedPath(origin: string, locale: Locale, pathWithQuery: string): string {
  const question = pathWithQuery.indexOf('?');
  const pathname = question === -1 ? pathWithQuery : pathWithQuery.slice(0, question);
  const query = question === -1 ? '' : pathWithQuery.slice(question);
  const path = stripLocalePrefix(pathname || '/');
  const base = path === '/' ? `${origin}/${locale}` : `${origin}/${locale}${path}`;
  return `${base}${query}`;
}
