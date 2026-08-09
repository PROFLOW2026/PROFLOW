import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { isRtl, localeDirection, LOCALE_METADATA } from '@/shared/i18n/config';
import {
  LtrIsland,
  rtlFlipClassName,
  shouldForceLtrInput,
  withLocaleDir,
} from '@/shared/i18n/ltr-island';

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
    expect(isRtl('fr-FR')).toBe(false);
  });

  it('forces LTR islands for email, url, tel, date, number and password inputs', () => {
    expect(shouldForceLtrInput('email', undefined)).toBe(true);
    expect(shouldForceLtrInput('url', undefined)).toBe(true);
    expect(shouldForceLtrInput('tel', undefined)).toBe(true);
    expect(shouldForceLtrInput('date', undefined)).toBe(true);
    expect(shouldForceLtrInput('datetime-local', undefined)).toBe(true);
    expect(shouldForceLtrInput('time', undefined)).toBe(true);
    expect(shouldForceLtrInput('month', undefined)).toBe(true);
    expect(shouldForceLtrInput('week', undefined)).toBe(true);
    expect(shouldForceLtrInput('number', undefined)).toBe(true);
    expect(shouldForceLtrInput('password', undefined)).toBe(true);
    expect(shouldForceLtrInput('text', undefined)).toBe(false);
    expect(shouldForceLtrInput('search', undefined)).toBe(false);
  });

  it('respects an explicit dir override', () => {
    expect(shouldForceLtrInput('email', 'rtl')).toBe(false);
    expect(shouldForceLtrInput('email', 'ltr')).toBe(false);
    expect(shouldForceLtrInput('text', 'ltr')).toBe(false);
  });

  it('fills missing dir via withLocaleDir without clobbering an explicit value', () => {
    expect(withLocaleDir({}, 'rtl')).toEqual({ dir: 'rtl' });
    expect(withLocaleDir({ dir: 'ltr' as const }, 'rtl')).toEqual({ dir: 'ltr' });
  });

  it('builds directional flip classes for chevrons', () => {
    expect(rtlFlipClassName('size-4')).toBe('size-4 rtl:rotate-180');
    expect(rtlFlipClassName()).toBe('rtl:rotate-180');
  });

  it('renders LtrIsland markup with isolate class and dir=ltr', () => {
    const html = renderToStaticMarkup(createElement(LtrIsland, null, 'office@example.com'));
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('pf-ltr-island');
    expect(html).toContain('office@example.com');
  });
});
