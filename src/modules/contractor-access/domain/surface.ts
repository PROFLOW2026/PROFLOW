import { CONTRACTOR_APP_METADATA_KEY, CONTRACTOR_APP_METADATA_VALUE } from '../application/auth-port';

/**
 * Surface separation decided in the proxy (edge of every page request):
 *  - contractor accounts (Supabase `app_metadata.pf_principal = 'contractor'`, service-role only) may
 *    use `/{locale}/contractor/**` (+ legal pages) and nothing else of the org app;
 *  - `/{locale}/contractor/**` never requires an organization membership;
 *  - anonymous visitors of protected contractor pages go to the contractor sign-in.
 * Pages still authorize on the server (`requireExternalContext` / org context); this is defense in depth.
 */

export const CONTRACTOR_PUBLIC_SEGMENTS = ['sign-in', 'activate', 'forgot-password', 'reset-password'] as const;

export function isContractorAppMetadata(appMetadata: unknown): boolean {
  return (
    typeof appMetadata === 'object' &&
    appMetadata !== null &&
    (appMetadata as Record<string, unknown>)[CONTRACTOR_APP_METADATA_KEY] === CONTRACTOR_APP_METADATA_VALUE
  );
}

/** `/he-IL/contractor/sign-in` -> { locale: 'he-IL', rest: ['contractor', 'sign-in'] } */
function split(pathname: string, locales: readonly string[]): { locale: string | null; rest: string[] } {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] && locales.includes(parts[0])) return { locale: parts[0], rest: parts.slice(1) };
  return { locale: null, rest: parts };
}

export type SurfaceDecision =
  | { readonly kind: 'pass' }
  | { readonly kind: 'redirect'; readonly pathname: string; readonly search?: string };

export function decideContractorSurface(input: {
  readonly pathname: string;
  readonly search: string;
  readonly locales: readonly string[];
  readonly defaultLocale: string;
  readonly user: { readonly appMetadata: unknown } | null;
}): SurfaceDecision {
  const { locale, rest } = split(input.pathname, input.locales);
  const activeLocale = locale ?? input.defaultLocale;
  const isContractorPath = rest[0] === 'contractor';
  const isPublicContractorPath =
    isContractorPath && (CONTRACTOR_PUBLIC_SEGMENTS as readonly string[]).includes(rest[1] ?? '');
  const isLegalPath = rest[0] === 'legal';
  const isContractorUser = input.user !== null && isContractorAppMetadata(input.user.appMetadata);

  if (isContractorUser && !isContractorPath && !isLegalPath) {
    return { kind: 'redirect', pathname: `/${activeLocale}/contractor` };
  }
  if (!input.user && isContractorPath && !isPublicContractorPath) {
    const next = `${input.pathname}${input.search}`;
    return {
      kind: 'redirect',
      pathname: `/${activeLocale}/contractor/sign-in`,
      search: `?next=${encodeURIComponent(next)}`,
    };
  }
  return { kind: 'pass' };
}

/** Only same-surface relative paths are honoured as post-sign-in targets. */
export function safeContractorNext(next: string | null | undefined, locale: string): string {
  const fallback = `/${locale}/contractor`;
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  const parts = next.split('?')[0]!.split('/').filter(Boolean);
  const contractorIndex = parts[0] === 'contractor' ? 0 : parts[1] === 'contractor' ? 1 : -1;
  if (contractorIndex < 0) return fallback;
  if ((CONTRACTOR_PUBLIC_SEGMENTS as readonly string[]).includes(parts[contractorIndex + 1] ?? '')) return fallback;
  return next;
}
