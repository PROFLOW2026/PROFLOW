import 'server-only';
import { cache } from 'react';
import { getLocale } from 'next-intl/server';
import type { ExternalContext } from '@/shared/external';
import { isDatabaseConfigured, getDb } from '@/shared/db/client';
import { redirect } from '@/shared/i18n/navigation';
import { createSupabaseServerClient, getSupabaseUser, isSupabaseConfigured } from '@/shared/supabase/server';
import { loadExternalContext, type ExternalSessionRejection } from './load-external-context';

export type ExternalSessionState =
  | { readonly status: 'anonymous' }
  | { readonly status: 'rejected'; readonly reason: ExternalSessionRejection }
  | { readonly status: 'authenticated'; readonly context: ExternalContext };

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split('.');
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Sign-in instant of the current session. Supabase keeps `amr[].timestamp` (authentication time)
 * stable across token refreshes, unlike `iat`, so it is the right value to compare with
 * `sessions_revoked_at`. Only read AFTER `getUser()` verified the same cookie session.
 */
async function sessionAuthenticatedAt(): Promise<Date | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const claims = decodeJwtPayload(session.access_token);
  if (!claims) return null;
  const amr = Array.isArray(claims.amr) ? (claims.amr as Array<{ timestamp?: unknown }>) : [];
  const stamps = amr.map((entry) => Number(entry.timestamp)).filter((value) => Number.isFinite(value) && value > 0);
  const seconds = stamps.length > 0 ? Math.max(...stamps) : Number(claims.iat);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

/** Cached per request: portal layout + page + actions share one resolution. */
export const getExternalSessionState = cache(async (): Promise<ExternalSessionState> => {
  if (!isSupabaseConfigured() || !isDatabaseConfigured()) return { status: 'anonymous' };
  const user = await getSupabaseUser();
  if (!user) return { status: 'anonymous' };
  const result = await loadExternalContext(getDb(), {
    authUserId: user.id,
    sessionAuthenticatedAt: await sessionAuthenticatedAt(),
    fallbackLocale: await getLocale(),
  });
  return result.ok ? { status: 'authenticated', context: result.context } : { status: 'rejected', reason: result.reason };
});

/**
 * Contractor session accessor (FROZEN SIGNATURE). Supabase session -> active contractor principal ->
 * live contractor grants -> RLS-bound executor. Never produces an OrgContext. Redirects to the
 * contractor sign-in page when there is no usable contractor session.
 */
export async function requireExternalContext(): Promise<ExternalContext> {
  const state = await getExternalSessionState();
  if (state.status === 'authenticated') return state.context;
  const locale = await getLocale();
  const href =
    state.status === 'anonymous' ? '/contractor/sign-in' : `/contractor/sign-in?reason=${encodeURIComponent(state.reason)}`;
  redirect({ href, locale });
}
