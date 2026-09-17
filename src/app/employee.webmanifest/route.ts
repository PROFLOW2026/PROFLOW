import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_COOKIE_NAME } from '@/shared/i18n/auth-locale';
import {
  buildEmployeeWebManifest,
  manifestLocaleFromCookie,
} from '@/modules/offline/domain/web-manifest';

export const dynamic = 'force-dynamic';

/** Employee App install metadata — launches into /{locale}/employee when installed from employee routes. */
export function GET(request: NextRequest): NextResponse {
  const locale = manifestLocaleFromCookie(request.cookies.get(LOCALE_COOKIE_NAME)?.value);
  return NextResponse.json(buildEmployeeWebManifest(locale), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
