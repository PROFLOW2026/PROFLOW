import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import type { NextRequest, NextResponse } from 'next/server';

/**
 * Refreshes the Supabase session cookies on an already-built response.
 *
 * Middleware is the only place that can write refreshed auth cookies for a
 * Server Component render, so this runs on every matched request.
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
  } = await supabase.auth.getUser();

  const override = decide?.(user ?? null);
  if (override) {
    // Keep refreshed auth cookies on the redirect.
    for (const cookie of response.cookies.getAll()) override.cookies.set(cookie);
    return override;
  }
  return response;
}
