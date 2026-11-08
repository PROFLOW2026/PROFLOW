import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STYLE_PREFERENCE,
  ENABLED_STYLES,
  localStorageStyleKey,
  normalizeStylePreference,
  isEnabledStyle,
  STYLE_AUTH_METADATA_KEY,
  STYLE_COOKIE_NAME,
  STYLE_PREFERENCES,
  type StylePreference,
} from '@/shared/theme/style/config';
import { resolveStylePreference, styleFromAuthMetadata } from '@/shared/theme/style/auth-style';

/** Same candidate order as getThemeBootstrap for signed-in users. */
function resolvePersistedStyle(
  metadata: Record<string, unknown> | null | undefined,
  cookieRaw: string | null | undefined,
): StylePreference {
  const metadataStyle = styleFromAuthMetadata(metadata);
  const cookieStyle = normalizeStylePreference(cookieRaw);
  return resolveStylePreference([metadataStyle, cookieStyle]);
}

describe('style persistence', () => {
  describe('config normalization', () => {
    it('exposes stable cookie, metadata, and localStorage keys', () => {
      expect(STYLE_COOKIE_NAME).toBe('pf-ui-style');
      expect(STYLE_AUTH_METADATA_KEY).toBe('ui_style_preference');
      expect(localStorageStyleKey('user-abc')).toBe('pf-ui-style:user-abc');
    });

    it('treats only enabled preferences as valid', () => {
      for (const style of STYLE_PREFERENCES) {
        expect(ENABLED_STYLES).toContain(style);
        expect(isEnabledStyle(style)).toBe(true);
        expect(normalizeStylePreference(style)).toBe(style);
      }
    });

    it('normalizes invalid stored values to classic (refresh / corrupt cookie)', () => {
      expect(normalizeStylePreference(undefined)).toBe(DEFAULT_STYLE_PREFERENCE);
      expect(normalizeStylePreference(null)).toBe(DEFAULT_STYLE_PREFERENCE);
      expect(normalizeStylePreference('')).toBe(DEFAULT_STYLE_PREFERENCE);
      expect(normalizeStylePreference('modern ')).toBe(DEFAULT_STYLE_PREFERENCE);
      expect(normalizeStylePreference('legacy')).toBe(DEFAULT_STYLE_PREFERENCE);
      expect(normalizeStylePreference(42)).toBe(DEFAULT_STYLE_PREFERENCE);
    });
  });

  describe('resolveStylePreference (metadata then cookie)', () => {
    it('prefers auth metadata over the browser cookie when both are valid', () => {
      expect(resolveStylePreference(['premium', 'modern'])).toBe('premium');
      expect(resolvePersistedStyle({ ui_style_preference: 'premium' }, 'modern')).toBe('premium');
    });

    it('does not let invalid metadata block a valid cookie', () => {
      expect(styleFromAuthMetadata({ ui_style_preference: 'broken' })).toBeNull();
      expect(resolveStylePreference([null, 'modern'])).toBe('modern');
      expect(resolvePersistedStyle({ ui_style_preference: 'broken' }, 'modern')).toBe('modern');
    });

    it('keeps the cookie choice across refresh when the user is signed out', () => {
      expect(resolvePersistedStyle(null, 'modern')).toBe('modern');
      expect(resolvePersistedStyle(undefined, 'premium')).toBe('premium');
    });

    it('falls back to classic when metadata and cookie are missing or invalid', () => {
      expect(resolveStylePreference([undefined, undefined])).toBe('classic');
      expect(resolveStylePreference([null, ''])).toBe('classic');
      expect(resolvePersistedStyle({}, 'nope')).toBe('classic');
    });

    it('matches sign-out reset: cookie back to classic with no metadata', () => {
      expect(resolvePersistedStyle(null, 'classic')).toBe('classic');
      expect(resolveStylePreference([null, DEFAULT_STYLE_PREFERENCE])).toBe('classic');
    });
  });
});