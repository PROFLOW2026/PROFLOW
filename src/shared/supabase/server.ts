import 'server-only';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase client for Server Components, Route Handlers and Server Actions
 * (doc 72 §3). Supabase Auth owns identity only; every authorization decision
 * is made against the ProjectFlow database.
 */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new SupabaseNotConfiguredError();

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. The middleware refreshes the
          // session on every request, so ignoring this is safe rather than fatal.
        }
      },
    },
  });
}

/**
 * Returns the Supabase auth user, or null when there is no valid session.
 *
 * Always `getUser()` and never `getSession()`: only `getUser()` revalidates the
 * token with the auth server, so a tampered cookie cannot forge an identity.
 */
export async function getSupabaseUser() {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) return null;
  return user;
}

/**
 * Lets the app boot and render a helpful setup screen before anyone has wired
 * up Supabase credentials, instead of crashing on import.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('Supabase Auth is not configured. See .env.example for the required variables.');
    this.name = 'SupabaseNotConfiguredError';
  }
}
