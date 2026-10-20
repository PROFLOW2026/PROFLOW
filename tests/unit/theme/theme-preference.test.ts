import { describe, expect, it } from 'vitest';
import { resolveThemePreference, themeFromAuthMetadata } from '@/shared/theme/auth-theme';
import { resolveEffectiveTheme, isThemePreference, DEFAULT_THEME_PREFERENCE } from '@/shared/theme/config';
import { readThemeCookieValue } from '@/shared/theme/theme-cookie';

describe('theme preference', () => {
  it('defaults to system when no candidates are valid', () => {
    expect(resolveThemePreference([null, undefined, 'invalid'])).toBe(DEFAULT_THEME_PREFERENCE);
  });

  it('reads ui_theme_preference from auth metadata', () => {
    expect(themeFromAuthMetadata({ ui_theme_preference: 'dark' })).toBe('dark');
    expect(themeFromAuthMetadata({ ui_theme_preference: 'nope' })).toBeNull();
  });

  it('resolves effective theme from preference and system', () => {
    expect(resolveEffectiveTheme('light', true)).toBe('light');
    expect(resolveEffectiveTheme('dark', false)).toBe('dark');
    expect(resolveEffectiveTheme('system', true)).toBe('dark');
    expect(resolveEffectiveTheme('system', false)).toBe('light');
  });

  it('validates theme preference values', () => {
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('auto')).toBe(false);
  });

  it('falls back cookie values to system', () => {
    expect(readThemeCookieValue(undefined)).toBe('system');
    expect(readThemeCookieValue('dark')).toBe('dark');
  });
});
