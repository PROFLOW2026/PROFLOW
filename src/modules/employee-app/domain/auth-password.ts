import 'server-only';

import { serverEnv } from '@/shared/env/server';

/**
 * Material stored in Supabase Auth as the user password.
 *
 * The employee enters a 6-digit PIN in the UI, but Auth never receives the raw
 * PIN alone. That prevents direct `signInWithPassword(email, pin)` calls against
 * the public Supabase Auth API from bypassing ProjectFlow login lockout logic.
 */
export function employeeSupabaseAuthPassword(pin: string): string {
  const serviceKey = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for employee auth passwords');
  }
  return `${pin}\u0000${serviceKey.slice(0, 43)}`;
}
