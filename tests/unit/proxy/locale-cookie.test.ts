import { describe, expect, it } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { LOCALE_COOKIE_NAME } from '@/shared/i18n/auth-locale';
import { persistLocaleCookieIfNeeded } from '@/shared/proxy/locale-cookie';

describe('proxy locale cookie', () => {
  it('does not set cookie when value already matches', () => {
    const request = new NextRequest('https://app.example.com/he-IL', {
      headers: { cookie: `${LOCALE_COOKIE_NAME}=he-IL` },
    });
    const response = NextResponse.next();
    persistLocaleCookieIfNeeded(request, response, 'he-IL');
    expect(response.cookies.get(LOCALE_COOKIE_NAME)).toBeUndefined();
  });

  it('sets cookie when missing or different', () => {
    const request = new NextRequest('https://app.example.com/en', {
      headers: { cookie: `${LOCALE_COOKIE_NAME}=he-IL` },
    });
    const response = NextResponse.next();
    persistLocaleCookieIfNeeded(request, response, 'en');
    expect(response.cookies.get(LOCALE_COOKIE_NAME)?.value).toBe('en');
  });
});
