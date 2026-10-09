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
import { persistLocaleCookieIfNeeded } from '@/shared/proxy/locale-cookie';
import { shouldSkipProxySessionRefresh } from '@/shared/proxy/public-session-fast-path';
import { refreshSupabaseSession } from '@/shared/supabase/middleware';
import { REQUEST_PATHNAME_HEADER } from '@/shared/http/request-pathname';
import { decideContractorSurface } from '@/modules/contractor-access/domain/surface';
import { logUsageRequestDiag } from '@/shared/observability/runtime-usage-diag';

function withRequestPathname(response: NextResponse, pathname: string): NextResponse {
  response.headers.set(REQUEST_PATHNAME_HEADER, pathname);
  return response;
}

const handleIntl = createIntlMiddleware(routing);

function localeFromPathname(pathname: string): Locale | null {
  const segment = pathname.split('/').filter(Boolean)[0];
  return isLocale(segment) ? segment : null;
}

/**
 * With `localeDetection: false`, next-intl ignores both Accept-Language and the
 * NEXT_LOCALE cookie for bare paths - they always become the default locale.
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
  persistLocaleCookieIfNeeded(request, response, locale);
  return response;
}

/** Next 16's replacement for the `middleware` file convention. */
export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  logUsageRequestDiag(request, pathname);

  const bare = localizeBarePath(request);
  if (bare) {
    const kind = barePathLocalization(pathname);
    if (!shouldRefreshSessionOnBarePath(kind)) {
      return withRequestPathname(bare, pathname);
    }
    const refreshed = await refreshSupabaseSession(request, bare);
    return withRequestPathname(refreshed, pathname);
  }

  const response = handleIntl(request);
  const pathLocale = localeFromPathname(pathname);
  if (pathLocale) {
    persistLocaleCookieIfNeeded(request, response, pathLocale);
  }

  if (shouldSkipProxySessionRefresh(request, pathname)) {
    return withRequestPathname(response, pathname);
  }

  const refreshed = await refreshSupabaseSession(request, response, (user) =>
    contractorSurfaceRedirect(request, user),
  );
  return withRequestPathname(refreshed, pathname);
}

/** Contractor accounts never reach the org app; protected contractor pages need a session. */
function contractorSurfaceRedirect(
  request: NextRequest,
  user: { app_metadata?: unknown } | null,
): NextResponse | null {
  const decision = decideContractorSurface({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    locales: routing.locales,
    defaultLocale: routing.defaultLocale,
    user: user ? { appMetadata: user.app_metadata } : null,
  });
  if (decision.kind === 'pass') return null;
  const url = request.nextUrl.clone();
  url.pathname = decision.pathname;
  url.search = decision.search ?? '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Locale + auth cookie refresh for app pages. API routes and `/auth/*`
    // (email confirmation / reset callback) stay outside next-intl so they are
    // not rewritten to `/en/...` via Accept-Language.
    // PWA shell + PDF.js worker must stay unprefixed or install/SW/PDF preview breaks.
    '/((?!api|auth|_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|sw\\.js|manifest\\.webmanifest|employee\\.webmanifest|offline\\.html|pdf\\.worker\\.min\\.mjs|pdf\\.worker\\.version\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|mjs)$).*)',
  ],
};
