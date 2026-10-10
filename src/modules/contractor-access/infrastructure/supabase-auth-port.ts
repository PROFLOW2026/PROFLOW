import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from '@/shared/supabase/admin';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/shared/supabase/server';
import {
  CONTRACTOR_APP_METADATA_KEY,
  CONTRACTOR_APP_METADATA_VALUE,
  ContractorAuthNotConfiguredError,
  type ContractorAuthPort,
} from '../application/auth-port';

const BAN_FOREVER = '876000h';

function admin() {
  if (!isSupabaseAdminConfigured()) throw new ContractorAuthNotConfiguredError();
  return getSupabaseAdminClient();
}

function statelessClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new ContractorAuthNotConfiguredError();
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function createSupabaseContractorAuthPort(): ContractorAuthPort {
  return {
    async createUser({ email, password, displayName }) {
      const { data, error } = await admin().auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { [CONTRACTOR_APP_METADATA_KEY]: CONTRACTOR_APP_METADATA_VALUE },
        user_metadata: displayName ? { display_name: displayName } : {},
      });
      if (error || !data.user) throw new Error(error?.message ?? 'Failed to create contractor auth user');
      return { authUserId: data.user.id };
    },
    async deleteUser(authUserId) {
      await admin().auth.admin.deleteUser(authUserId);
    },
    async setPassword(authUserId, password) {
      const { error } = await admin().auth.admin.updateUserById(authUserId, { password });
      if (error) throw new Error(error.message);
    },
    async updateUserEmail(authUserId, email) {
      const { error } = await admin().auth.admin.updateUserById(authUserId, { email, email_confirm: true });
      if (error) throw new Error(error.message);
    },
    async setBanned(authUserId, banned) {
      const { error } = await admin().auth.admin.updateUserById(authUserId, {
        ban_duration: banned ? BAN_FOREVER : 'none',
      });
      if (error) throw new Error(error.message);
    },
    async signInWithPassword(email, password) {
      if (!isSupabaseConfigured()) throw new ContractorAuthNotConfiguredError();
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        const invalid = error?.code === 'invalid_credentials' || error?.message === 'Invalid login credentials';
        return { ok: false, reason: invalid ? 'invalid_credentials' : 'auth_error' };
      }
      return { ok: true, authUserId: data.user.id };
    },
    async verifyPassword(email, password) {
      const { data, error } = await statelessClient().auth.signInWithPassword({ email, password });
      return !error && Boolean(data.user);
    },
    async signOutCurrent() {
      if (!isSupabaseConfigured()) return;
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    },
  };
}
