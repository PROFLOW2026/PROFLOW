import type { NextRequest } from 'next/server';
import { CONTRACTOR_PUBLIC_SEGMENTS } from '@/modules/contractor-access/domain/surface';
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

/**
 * Live camera share viewer: exactly `/live/<token>`. Public and account-free by design, so it never needs
 * (or touches) a session. Any deeper path is not part of this exception.
 */
export function isLiveSharePublicPath(segments: readonly string[]): boolean {
  return segments[0] === 'live' && segments.length === 2;
}

/** One-time supplier RFQ quote form — public, no session. */
export function isSupplierRfqPublicPath(segments: readonly string[]): boolean {
  return segments[0] === 'supplier-rfq' && segments.length === 2;
}

export function isOrgPublicAuthPath(segments: readonly string[]): boolean {
  const first = segments[0];
  return (
    typeof first === 'string' &&
    (ORG_PUBLIC_AUTH_SEGMENTS as readonly string[]).includes(first)
  );
}

/** Employee PIN login — public form; no session required to paint. */
export function isEmployeePublicLoginPath(segments: readonly string[]): boolean {
  return segments[0] === 'employee' && segments[1] === 'login';
}

/** Contractor activate / sign-in / password recovery forms. */
export function isContractorPublicAuthPath(segments: readonly string[]): boolean {
  if (segments[0] !== 'contractor') return false;
  const second = segments[1];
  return (
    typeof second === 'string' &&
    (CONTRACTOR_PUBLIC_SEGMENTS as readonly string[]).includes(second)
  );
}

/** True when the pathname is a candidate for skipping Supabase session refresh. */
export function isPublicSessionFastPathCandidate(pathname: string): boolean {
  const { locale, segments } = splitLocalizedPathname(pathname);
  if (!locale) return false;
  return (
    isLegalPublicPath(segments) ||
    isLiveSharePublicPath(segments) ||
    isSupplierRfqPublicPath(segments) ||
    isOrgPublicAuthPath(segments) ||
    isEmployeePublicLoginPath(segments) ||
    isContractorPublicAuthPath(segments)
  );
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
 * - Legal and the live share viewer: always (no session is needed, and a signed-in
 *   account must not be redirected away from a link it was handed).
 * - Public auth pages (org / employee login / contractor auth): only for
 *   anonymous visitors (no auth cookies). When cookies exist, refresh still
 *   runs so principals are redirected to the correct surface.
 */
export function shouldSkipProxySessionRefresh(
  request: NextRequest,
  pathname: string,
): boolean {
  if (!isPublicSessionFastPathCandidate(pathname)) return false;
  const { segments } = splitLocalizedPathname(pathname);
  if (
    isLegalPublicPath(segments) ||
    isLiveSharePublicPath(segments) ||
    isSupplierRfqPublicPath(segments)
  ) {
    return true;
  }
  return !requestHasSupabaseAuthCookies(request);
}
