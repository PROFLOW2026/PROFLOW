import type { NextRequest } from 'next/server';
import { isLocale, type Locale } from '@/shared/i18n/config';

/** Org auth/marketing paths that render without requiring an existing session. */
export const ORG_PUBLIC_AUTH_SEGMENTS = [
  'sign-in',
  'sign-up',
  'forgot-password',
  'portal-access',
] as const;

export function splitLocalizedPathname(pathname: string): {
  locale: Locale | null;
  segments: readonly string[];
} {
  const parts = pathname.split('/').filter(Boolean);
  const head = parts[0];
  if (head && isLocale(head)) {
    return { locale: head, segments: parts.slice(1) };
  }
  return { locale: null, segments: parts };
}

export function isLegalPublicPath(segments: readonly string[]): boolean {
  return segments[0] === 'legal';
}

export function isOrgPublicAuthPath(segments: readonly string[]): boolean {
  const first = segments[0];
  return (
    typeof first === 'string' &&
    (ORG_PUBLIC_AUTH_SEGMENTS as readonly string[]).includes(first)
  );
}

/** True when the pathname is a candidate for skipping Supabase session refresh. */
export function isPublicSessionFastPathCandidate(pathname: string): boolean {
  const { locale, segments } = splitLocalizedPathname(pathname);
  if (!locale) return false;
  return isLegalPublicPath(segments) || isOrgPublicAuthPath(segments);
}

/** Supabase SSR auth cookies (chunked or single). */
export function requestHasSupabaseAuthCookies(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => {
    const name = cookie.name;
    return name.includes('-auth-token') || (name.startsWith('sb-') && name.includes('auth'));
  });
}

/**
 * Skip `refreshSupabaseSession` when safe:
 * - Legal: always (contractor surface allows legal without redirect).
 * - Org auth pages: only for anonymous visitors (no auth cookies). When cookies exist,
 *   refresh still runs so contractor accounts are redirected off org sign-in, etc.
 */
export function shouldSkipProxySessionRefresh(
  request: NextRequest,
  pathname: string,
): boolean {
  if (!isPublicSessionFastPathCandidate(pathname)) return false;
  const { segments } = splitLocalizedPathname(pathname);
  if (isLegalPublicPath(segments)) return true;
  return !requestHasSupabaseAuthCookies(request);
}
