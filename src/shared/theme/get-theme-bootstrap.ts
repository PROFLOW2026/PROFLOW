import 'server-only';

import { cookies } from 'next/headers';
import { getSupabaseUser } from '@/shared/supabase/server';
import { resolveThemePreference, themeFromAuthMetadata } from './auth-theme';
import { readThemeCookieValue, THEME_COOKIE_NAME } from './theme-cookie';
import type { ThemePreference } from './config';

export type ThemeBootstrap = {
  readonly preference: ThemePreference;
  readonly userId: string | null;
};

/** Server-side theme for ThemeProvider and html boot (cookie + signed-in metadata). */
export async function getThemeBootstrap(): Promise<ThemeBootstrap> {
  const cookieStore = await cookies();
  const cookiePreference = readThemeCookieValue(cookieStore.get(THEME_COOKIE_NAME)?.value);

  const authUser = await getSupabaseUser();
  if (!authUser?.id) {
    return { preference: cookiePreference, userId: null };
  }

  const metadataPreference = themeFromAuthMetadata(
    authUser.user_metadata as Record<string, unknown> | undefined,
  );

  const preference = resolveThemePreference([metadataPreference, cookiePreference]);

  // Cookie writes belong in Server Actions / Route Handlers (auth callback, persist action).
  // Setting here from a layout Server Component throws and breaks every locale page.

  return { preference, userId: authUser.id };
}
