import type { NextRequest, NextResponse } from 'next/server';
import { LOCALE_COOKIE_NAME } from '@/shared/i18n/auth-locale';
import type { Locale } from '@/shared/i18n/config';

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function persistLocaleCookie(response: NextResponse, locale: Locale): void {
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: '/',
    sameSite: 'lax',
    maxAge: LOCALE_COOKIE_MAX_AGE,
  });
}

/** Emit Set-Cookie only when missing or the locale value changed. */
export function persistLocaleCookieIfNeeded(
  request: NextRequest,
  response: NextResponse,
  locale: Locale,
): void {
  const existing = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (existing === locale) return;
  persistLocaleCookie(response, locale);
}
