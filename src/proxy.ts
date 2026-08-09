import createIntlMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { LOCALE_COOKIE_NAME } from '@/shared/i18n/auth-locale';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/shared/i18n/config';
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
 */
function redirectBarePathWithCookieLocale(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (localeFromPathname(pathname)) return null;

  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  const url = request.nextUrl.clone();
  url.pathname = pathname === '/' ? `/${locale}` : `/${locale}${pathname}`;
  const response = NextResponse.redirect(url);
  persistLocaleCookie(response, locale);
  return response;
}

/** Next 16's replacement for the `middleware` file convention. */
export default async function proxy(request: NextRequest) {
  const bareRedirect = redirectBarePathWithCookieLocale(request);
  if (bareRedirect) {
    return refreshSupabaseSession(request, bareRedirect);
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
    '/((?!api|auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
