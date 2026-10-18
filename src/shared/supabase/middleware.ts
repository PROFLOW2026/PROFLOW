import { createServerClient } from '@supabase/ssr';
import type { AuthError, User } from '@supabase/supabase-js';
import type { NextRequest, NextResponse } from 'next/server';

function isStaleSupabaseAuthError(error: AuthError | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  const message = error.message ?? '';
  return (
    code === 'refresh_token_not_found' ||
    code === 'session_not_found' ||
    /refresh token/i.test(message) ||
    /session.*not found/i.test(message)
  );
}

function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse): void {
  for (const cookie of request.cookies.getAll()) {
    const name = cookie.name;
    const isAuth =
      name.includes('-auth-token') || (name.startsWith('sb-') && name.includes('auth'));
    if (!isAuth) continue;
    response.cookies.set(name, '', {
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    });
  }
}

/**
 * Refreshes the Supabase session cookies on an already-built response.
 *
 * Middleware is the only place that can write refreshed auth cookies for a
 * Server Component render, so this runs on every matched request.
 *
 * Stale refresh tokens are cleared so later navigations skip the slow auth
 * round-trip on public pages (and stop hanging the UI on every click).
 */
export async function refreshSupabaseSession(
  request: NextRequest,
  response: NextResponse,
  /** Lets the proxy route by identity without a second auth round trip (contractor surface split). */
  decide?: (user: User | null) => NextResponse | null,
): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production' || request.nextUrl.protocol === 'https:',
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (isStaleSupabaseAuthError(error)) {
    clearSupabaseAuthCookies(request, response);
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Cookie clear above is enough; local signOut is best-effort.
    }
    const override = decide?.(null);
    if (override) {
      for (const cookie of response.cookies.getAll()) override.cookies.set(cookie);
      return override;
    }
    return response;
  }

  const override = decide?.(user ?? null);
  if (override) {
    // Keep refreshed auth cookies on the redirect.
    for (const cookie of response.cookies.getAll()) override.cookies.set(cookie);
    return override;
  }
  return response;
}
