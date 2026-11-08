import {
  DEFAULT_THEME_PREFERENCE,
  resolveEffectiveTheme,
  type ThemePreference,
  type ResolvedTheme,
} from './config';
import type { StylePreference } from './style/config';

/** Browser/PWA chrome — aligned with semantic page/surface tokens. */
export const PWA_THEME_COLOR_LIGHT = '#0f766e';
export const PWA_THEME_COLOR_DARK = '#252d3d';
export const PWA_BACKGROUND_LIGHT = '#f4f6f8';
export const PWA_BACKGROUND_DARK = '#171c28';
/** Installed-app splash — opaque brand teal (matches PWA install icons). */
export const PWA_SPLASH_BACKGROUND = '#0f766e';

export type PwaThemeColors = {
  readonly themeColor: string;
  readonly backgroundColor: string;
};

const STYLE_CHROME: Record<StylePreference, { light: string; dark: string; lightBg: string; darkBg: string }> = {
  classic: {
    light: PWA_THEME_COLOR_LIGHT,
    dark: '#151d2b',
    lightBg: PWA_BACKGROUND_LIGHT,
    darkBg: PWA_BACKGROUND_DARK,
  },
  modern: { light: '#ffffff', dark: '#161d25', lightBg: '#f5f7f9', darkBg: '#0e1318' },
  premium: { light: '#eef0f1', dark: '#0c1012', lightBg: '#eef0f1', darkBg: '#0c1012' },
};

export function pwaColorsForResolved(resolved: ResolvedTheme): PwaThemeColors {
  return resolved === 'dark'
    ? { themeColor: PWA_THEME_COLOR_DARK, backgroundColor: PWA_BACKGROUND_DARK }
    : { themeColor: PWA_THEME_COLOR_LIGHT, backgroundColor: PWA_BACKGROUND_LIGHT };
}

export function pwaColorsForStyle(style: StylePreference, resolved: ResolvedTheme): PwaThemeColors {
  if (style === 'classic') return pwaColorsForResolved(resolved);
  const row = STYLE_CHROME[style];
  return resolved === 'dark'
    ? { themeColor: row.dark, backgroundColor: row.darkBg }
    : { themeColor: row.light, backgroundColor: row.lightBg };
}

/** Manifest body colors from stored preference (system → light install splash). */
export function pwaManifestColors(preference: ThemePreference, style: StylePreference = 'classic'): PwaThemeColors {
  const chrome = pwaColorsForStyle(style, preference === 'dark' ? 'dark' : 'light');
  return { themeColor: chrome.themeColor, backgroundColor: PWA_SPLASH_BACKGROUND };
}

export function pwaColorsForPreference(
  preference: ThemePreference,
  prefersDark: boolean,
  style: StylePreference = 'classic',
): PwaThemeColors {
  return pwaColorsForStyle(style, resolveEffectiveTheme(preference, prefersDark));
}

export { DEFAULT_THEME_PREFERENCE };