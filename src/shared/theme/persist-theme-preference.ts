'use server';

import { cookies } from 'next/headers';
import { createSupabaseServerClient, getSupabaseUser } from '@/shared/supabase/server';
import { localeCookieSecure } from '@/shared/proxy/locale-cookie';
import {
  DEFAULT_THEME_PREFERENCE,
  isThemePreference,
  THEME_AUTH_METADATA_KEY,
  type ThemePreference,
} from './config';
import { themeCookieOptions, THEME_COOKIE_NAME } from './theme-cookie';

/** Persist UI theme for the signed-in user (auth metadata + cookie). No profile SQL. */
export async function persistThemePreferenceAction(preference: string): Promise<void> {
  if (!isThemePreference(preference)) return;

  const authUser = await getSupabaseUser();
  const cookieStore = await cookies();

  cookieStore.set(THEME_COOKIE_NAME, preference, themeCookieOptions(localeCookieSecure()));

  if (!authUser?.id) return;

  const supabase = await createSupabaseServerClient();
  await supabase.auth.updateUser({
    data: { [THEME_AUTH_METADATA_KEY]: preference },
  });
}

/** Reset theme cookie on sign-out so the next account on a shared device starts clean. */
export async function resetThemeCookieForSignOutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    THEME_COOKIE_NAME,
    DEFAULT_THEME_PREFERENCE,
    themeCookieOptions(localeCookieSecure()),
  );
}

export type { ThemePreference };
