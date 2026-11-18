import 'server-only';

import { getSupabaseAdminClient } from '@/shared/supabase/admin';
import type { DemoAuthDeletion } from './orphan-identities';

/** Supabase Auth delete that distinguishes an already-removed user from a real failure. */
export async function deleteDemoAuthUserViaSupabase(userId: string): Promise<DemoAuthDeletion> {
  const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(userId);
  if (!error) return 'deleted';
  if (error.status === 404 || /not.?found/i.test(error.message)) return 'missing';
  throw error;
}
