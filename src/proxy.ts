import createIntlMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { LOCALE_COOKIE_NAME } from '@/shared/i18n/auth-locale';
import {
  barePathLocalization,
  localeFromCookieValue,
  prefixedPathname,
  shouldRefreshSessionOnBarePath,
} from '@/shared/i18n/bare-path';
import { isLocale, type Locale } from '@/shared/i18n/config';
import { routing } from '@/shared/i18n/routing';
import { refreshSupabaseSession } from '@/shared/supabase/middleware';

const handleIntl = createIntlMiddleware(routing);

const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function persistLocaleCookie(response: NextResponse, locale: Locale): void {
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: '/',
    sameSite: 'lax',
    maxAge: LOCALE_COOKIE_MAX_AGE,
  });
}

function localeFromPathname(pathname: string): Locale | null {
  const segment = pathname.split('/').filter(Boolean)[0];
  return isLocale(segment) ? segment : null;
}

/**
 * With `localeDetection: false`, next-intl ignores both Accept-Language and the
 * NEXT_LOCALE cookie for bare paths — they always become the default locale.
 * We still need cookie persistence for English users who chose `/en/...`, and
 * we must never invent `/en` from the browser language alone.
 *
 * `/` is rewritten (not redirected) so installed-app start_url paints in one
 * document request. Other bare paths redirect so shareable URLs stay prefixed.
 */
function localizeBarePath(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const kind = barePathLocalization(pathname);
  if (kind === 'passthrough') return null;

  const locale = localeFromCookieValue(request.cookies.get(LOCALE_COOKIE_NAME)?.value);
  const url = request.nextUrl.clone();
  url.pathname = prefixedPathname(pathname, locale);

  const response =
    kind === 'rewrite-root' ? NextResponse.rewrite(url) : NextResponse.redirect(url);
  persistLocaleCookie(response, locale);
  return response;
}

/** Next 16's replacement for the `middleware` file convention. */
export default async function proxy(request: NextRequest) {
  const bare = localizeBarePath(request);
  if (bare) {
    const kind = barePathLocalization(request.nextUrl.pathname);
    if (!shouldRefreshSessionOnBarePath(kind)) {
      return bare;
    }
    return refreshSupabaseSession(request, bare);
  }

  const response = handleIntl(request);
  const pathLocale = localeFromPathname(request.nextUrl.pathname);
  if (pathLocale) {
    persistLocaleCookie(response, pathLocale);
  }
  return refreshSupabaseSession(request, response);
}

export const config = {
  matcher: [
    // Locale + auth cookie refresh for app pages. API routes and `/auth/*`
    // (email confirmation / reset callback) stay outside next-intl so they are
    // not rewritten to `/en/...` via Accept-Language.
    // PWA shell assets must stay unprefixed or install/SW registration breaks.
    '/((?!api|auth|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|offline\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
