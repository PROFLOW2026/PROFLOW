import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_COOKIE_NAME } from '@/shared/i18n/auth-locale';
import { buildWebManifest, manifestLocaleFromCookie } from '@/modules/offline/domain/web-manifest';
import { readThemeCookieValue, THEME_COOKIE_NAME } from '@/shared/theme/theme-cookie';

export const dynamic = 'force-dynamic';

/** Cookie-aware install metadata. Network-first in the SW so start_url can update. */
export function GET(request: NextRequest): NextResponse {
  const locale = manifestLocaleFromCookie(request.cookies.get(LOCALE_COOKIE_NAME)?.value);
  const themePreference = readThemeCookieValue(request.cookies.get(THEME_COOKIE_NAME)?.value);
  return NextResponse.json(buildWebManifest(locale, themePreference), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
