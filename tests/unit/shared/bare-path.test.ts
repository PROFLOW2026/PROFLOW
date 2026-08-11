import { describe, expect, it } from 'vitest';
import {
  barePathLocalization,
  localeFromCookieValue,
  prefixedPathname,
  shouldRefreshSessionOnBarePath,
} from '@/shared/i18n/bare-path';

describe('bare path localization', () => {
  it('rewrites PWA start_url / in one hop and skips Auth on other redirects', () => {
    expect(barePathLocalization('/')).toBe('rewrite-root');
    expect(barePathLocalization('')).toBe('rewrite-root');
    expect(shouldRefreshSessionOnBarePath('rewrite-root')).toBe(true);

    expect(barePathLocalization('/sign-in')).toBe('redirect');
    expect(shouldRefreshSessionOnBarePath('redirect')).toBe(false);

    expect(barePathLocalization('/he-IL')).toBe('passthrough');
    expect(barePathLocalization('/en/projects')).toBe('passthrough');
    expect(shouldRefreshSessionOnBarePath('passthrough')).toBe(true);
  });

  it('prefixes from the locale cookie without inventing en from Accept-Language', () => {
    expect(localeFromCookieValue('en')).toBe('en');
    expect(localeFromCookieValue('he-IL')).toBe('he-IL');
    expect(localeFromCookieValue(undefined)).toBe('he-IL');
    expect(localeFromCookieValue('fr')).toBe('he-IL');
    expect(prefixedPathname('/', 'en')).toBe('/en');
    expect(prefixedPathname('/sign-in', 'he-IL')).toBe('/he-IL/sign-in');
  });
});
