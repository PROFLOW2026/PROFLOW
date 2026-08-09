'use client';

import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/shared/env/public';

let client: ReturnType<typeof createBrowserClient> | undefined;

/** Browser Supabase client. Only ever receives the anon key. */
export function getSupabaseBrowserClient() {
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Supabase Auth is not configured in this environment.');
  }

  client ??= createBrowserClient(url, anonKey);
  return client;
}
