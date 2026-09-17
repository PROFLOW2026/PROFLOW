import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '@/shared/env/public';
import { serverEnv } from '@/shared/env/server';

let adminClient: SupabaseClient | null = null;

export function isSupabaseAdminConfigured(): boolean {
  return Boolean(publicEnv.NEXT_PUBLIC_SUPABASE_URL && serverEnv().SUPABASE_SERVICE_ROLE_KEY);
}

/** Service-role Supabase client for server-only admin operations (employee provisioning). */
export function getSupabaseAdminClient(): SupabaseClient {
  if (!isSupabaseAdminConfigured()) {
    throw new Error('Supabase admin is not configured');
  }
  if (!adminClient) {
    adminClient = createClient(
      publicEnv.NEXT_PUBLIC_SUPABASE_URL!,
      serverEnv().SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return adminClient;
}
