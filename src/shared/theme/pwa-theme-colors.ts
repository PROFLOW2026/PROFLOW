import {
  DEFAULT_THEME_PREFERENCE,
  resolveEffectiveTheme,
  type ThemePreference,
  type ResolvedTheme,
} from './config';

/** Browser/PWA chrome — aligned with semantic page/surface tokens. */
export const PWA_THEME_COLOR_LIGHT = '#0f766e';
export const PWA_THEME_COLOR_DARK = '#252d3d';
export const PWA_BACKGROUND_LIGHT = '#f4f6f8';
export const PWA_BACKGROUND_DARK = '#171c28';

export type PwaThemeColors = {
  readonly themeColor: string;
  readonly backgroundColor: string;
};

export function pwaColorsForResolved(resolved: ResolvedTheme): PwaThemeColors {
  return resolved === 'dark'
    ? { themeColor: PWA_THEME_COLOR_DARK, backgroundColor: PWA_BACKGROUND_DARK }
    : { themeColor: PWA_THEME_COLOR_LIGHT, backgroundColor: PWA_BACKGROUND_LIGHT };
}

/** Manifest body colors from stored preference (system → light install splash). */
export function pwaManifestColors(preference: ThemePreference): PwaThemeColors {
  if (preference === 'dark') return pwaColorsForResolved('dark');
  if (preference === 'light') return pwaColorsForResolved('light');
  return pwaColorsForResolved('light');
}

export function pwaColorsForPreference(
  preference: ThemePreference,
  prefersDark: boolean,
): PwaThemeColors {
  return pwaColorsForResolved(resolveEffectiveTheme(preference, prefersDark));
}

export { DEFAULT_THEME_PREFERENCE };
