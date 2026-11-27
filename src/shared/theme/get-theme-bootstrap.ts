import 'server-only';

import { cookies } from 'next/headers';
import { getSupabaseUser } from '@/shared/supabase/server';
import { resolveThemePreference, themeFromAuthMetadata } from './auth-theme';
import { readThemeCookieValue, THEME_COOKIE_NAME } from './theme-cookie';
import type { ThemePreference } from './config';
import { resolveStylePreference, styleFromAuthMetadata } from './style/auth-style';
import { readStyleCookieValue, STYLE_COOKIE_NAME } from './style/style-cookie';
import type { StylePreference } from './style/config';
import { resolveDesignPreference, designFromAuthMetadata } from './design/auth-design';
import { readDesignCookieValue, DESIGN_COOKIE_NAME } from './design/cookie';
import type { DesignPreference } from './design/config';

export type ThemeBootstrap = {
  readonly preference: ThemePreference;
  readonly style: StylePreference;
  readonly design: DesignPreference;
  readonly userId: string | null;
};

/** Server-side theme for ThemeProvider and html boot (cookie + signed-in metadata). */
export async function getThemeBootstrap(): Promise<ThemeBootstrap> {
  const cookieStore = await cookies();
  const cookiePreference = readThemeCookieValue(cookieStore.get(THEME_COOKIE_NAME)?.value);
  const cookieStyle = readStyleCookieValue(cookieStore.get(STYLE_COOKIE_NAME)?.value);
  const cookieDesign = readDesignCookieValue(cookieStore.get(DESIGN_COOKIE_NAME)?.value);

  const authUser = await getSupabaseUser();
  if (!authUser?.id) {
    return { preference: cookiePreference, style: cookieStyle, design: cookieDesign, userId: null };
  }

  const metadataPreference = themeFromAuthMetadata(
    authUser.user_metadata as Record<string, unknown> | undefined,
  );

  const preference = resolveThemePreference([metadataPreference, cookiePreference]);
  const metadataStyle = styleFromAuthMetadata(
    authUser.user_metadata as Record<string, unknown> | undefined,
  );
  const style = resolveStylePreference([metadataStyle, cookieStyle]);
  const metadataDesign = designFromAuthMetadata(
    authUser.user_metadata as Record<string, unknown> | undefined,
  );
  const design = resolveDesignPreference([metadataDesign, cookieDesign]);

  // Cookie writes belong in Server Actions / Route Handlers (auth callback, persist action).
  // Setting here from a layout Server Component throws and breaks every locale page.

  return { preference, style, design, userId: authUser.id };
}
