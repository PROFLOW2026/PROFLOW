import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/shared/supabase/server';
import {
  joinLocalizedPath,
  LOCALE_COOKIE_NAME,
  localeFromAuthMetadata,
  resolveAuthLocale,
  safeAppPath,
} from '@/shared/i18n/auth-locale';
import type { Locale } from '@/shared/i18n/config';

/**
 * Exchanges the one-time code from a confirmation or reset email for a session.
 *
 * Lives outside `[locale]` so next-intl cannot rewrite this URL via Accept-Language.
 * Locale comes from the email link (`locale=`), then the NEXT_LOCALE cookie,
 * then sign-up `locale_preference` metadata, then the product default (`he-IL`)
 * — never from the browser language header alone.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = safeAppPath(searchParams.get('next')) ?? '/';

  const redirectInLocale = (locale: Locale, pathWithQuery: string) => {
    const response = NextResponse.redirect(joinLocalizedPath(origin, locale, pathWithQuery));
    // Mirror next-intl's cookie so subsequent bare redirects stay in this locale.
    response.cookies.set(LOCALE_COOKIE_NAME, locale, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  };

  const localeBeforeSession = resolveAuthLocale([
    searchParams.get('locale'),
    request.cookies.get(LOCALE_COOKIE_NAME)?.value,
  ]);

  if (!code || !isSupabaseConfigured()) {
    return redirectInLocale(localeBeforeSession, '/sign-in?error=auth-callback');
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectInLocale(localeBeforeSession, '/sign-in?error=auth-callback');
  }

  // Sign-up stores locale_preference in auth metadata; honour it when the email
  // link dropped `locale=` (e.g. opened on another device without NEXT_LOCALE).
  const locale = resolveAuthLocale([
    searchParams.get('locale'),
    request.cookies.get(LOCALE_COOKIE_NAME)?.value,
    localeFromAuthMetadata(data.session?.user?.user_metadata),
  ]);

  return redirectInLocale(locale, next);
}
