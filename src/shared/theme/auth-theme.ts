import {
  DEFAULT_THEME_PREFERENCE,
  isThemePreference,
  THEME_AUTH_METADATA_KEY,
  type ThemePreference,
} from './config';

/** Read ui_theme_preference from Supabase user_metadata. */
export function themeFromAuthMetadata(
  metadata: Record<string, unknown> | null | undefined,
): ThemePreference | null {
  const value = metadata?.[THEME_AUTH_METADATA_KEY];
  return isThemePreference(value) ? value : null;
}

export function resolveThemePreference(
  candidates: Array<string | null | undefined>,
): ThemePreference {
  for (const candidate of candidates) {
    if (isThemePreference(candidate)) return candidate;
  }
  return DEFAULT_THEME_PREFERENCE;
}
