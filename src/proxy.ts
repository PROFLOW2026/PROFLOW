import createIntlMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from '@/shared/i18n/routing';
import { refreshSupabaseSession } from '@/shared/supabase/middleware';

const handleIntl = createIntlMiddleware(routing);

/** Next 16's replacement for the `middleware` file convention. */
export default async function proxy(request: NextRequest) {
  // Locale resolution runs first so the response already carries the right
  // rewrite and locale cookie; the auth refresh then adds its cookies to it.
  const response = handleIntl(request);
  return refreshSupabaseSession(request, response);
}

export const config = {
  matcher: [
    // Locale + auth cookie refresh for app pages. API routes stay outside
    // next-intl so Bearer key auth on /api/v1/* is not rewritten.
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
