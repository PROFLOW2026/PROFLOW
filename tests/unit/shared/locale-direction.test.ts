import { describe, expect, it } from 'vitest';
import { isRtl, localeDirection, LOCALE_METADATA } from '@/shared/i18n/config';
import { shouldForceLtrInput } from '@/shared/i18n/direction';

describe('locale direction', () => {
  it('marks Hebrew as RTL and English as LTR', () => {
    expect(localeDirection('he-IL')).toBe('rtl');
    expect(localeDirection('en')).toBe('ltr');
    expect(isRtl('he-IL')).toBe(true);
    expect(isRtl('en')).toBe(false);
    expect(LOCALE_METADATA['he-IL'].dir).toBe('rtl');
    expect(LOCALE_METADATA.en.dir).toBe('ltr');
  });

  it('falls back to LTR for unknown locales', () => {
    expect(localeDirection('fr-FR')).toBe('ltr');
  });

  it('forces LTR islands for email, url, tel, date and password inputs', () => {
    expect(shouldForceLtrInput('email', undefined)).toBe(true);
    expect(shouldForceLtrInput('url', undefined)).toBe(true);
    expect(shouldForceLtrInput('tel', undefined)).toBe(true);
    expect(shouldForceLtrInput('date', undefined)).toBe(true);
    expect(shouldForceLtrInput('password', undefined)).toBe(true);
    expect(shouldForceLtrInput('text', undefined)).toBe(false);
  });

  it('respects an explicit dir override', () => {
    expect(shouldForceLtrInput('email', 'rtl')).toBe(false);
  });
});
