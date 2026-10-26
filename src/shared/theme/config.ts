/** UI color theme preference (not document/PDF branding). */
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export type ResolvedTheme = 'light' | 'dark';

/** When cookie and auth metadata are absent, start in day mode (not OS/system). */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'light';

export const THEME_COOKIE_NAME = 'pf-ui-theme';

export const THEME_AUTH_METADATA_KEY = 'ui_theme_preference';

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function localStorageThemeKey(userId: string): string {
  return `pf-ui-theme:${userId}`;
}

export function resolveEffectiveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return prefersDark ? 'dark' : 'light';
}

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
