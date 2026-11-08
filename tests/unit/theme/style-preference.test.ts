import { describe, expect, it } from 'vitest';
import { isEnabledStyle, normalizeStylePreference } from '@/shared/theme/style/config';
import { resolveStylePreference, styleFromAuthMetadata } from '@/shared/theme/style/auth-style';

describe('style preference', () => {
  it('keeps the three enabled styles and falls back to classic', () => {
    expect(isEnabledStyle('classic')).toBe(true);
    expect(isEnabledStyle('modern')).toBe(true);
    expect(isEnabledStyle('premium')).toBe(true);
    expect(normalizeStylePreference('premium')).toBe('premium');
    expect(normalizeStylePreference('nope')).toBe('classic');
    expect(normalizeStylePreference(null)).toBe('classic');
  });

  it('ignores invalid metadata so the cookie can win', () => {
    expect(styleFromAuthMetadata({ ui_style_preference: 'nope' })).toBeNull();
    expect(styleFromAuthMetadata(undefined)).toBeNull();
    expect(resolveStylePreference([null, 'modern'])).toBe('modern');
  });

  it('prefers metadata over the cookie', () => {
    expect(styleFromAuthMetadata({ ui_style_preference: 'premium' })).toBe('premium');
    expect(resolveStylePreference(['premium', 'classic'])).toBe('premium');
    expect(resolveStylePreference([undefined, undefined])).toBe('classic');
  });
});