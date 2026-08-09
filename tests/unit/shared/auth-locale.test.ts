import { describe, expect, it } from 'vitest';
import {
  buildAuthCallbackUrl,
  joinLocalizedPath,
  localeFromAuthMetadata,
  resolveAuthLocale,
  safeAppPath,
  stripLocalePrefix,
} from '@/shared/i18n/auth-locale';

describe('resolveAuthLocale', () => {
  it('prefers an explicit he-IL query value over other candidates', () => {
    expect(resolveAuthLocale(['he-IL', 'en'])).toBe('he-IL');
  });

  it('accepts a NEXT_LOCALE cookie value when query is missing', () => {
    expect(resolveAuthLocale([null, 'he-IL'])).toBe('he-IL');
    expect(resolveAuthLocale([undefined, 'en'])).toBe('en');
  });

  it('falls back to he-IL instead of inventing en from empty input', () => {
    expect(resolveAuthLocale([null, undefined, ''])).toBe('he-IL');
    expect(resolveAuthLocale(['fr-FR'])).toBe('he-IL');
  });

  it('honours sign-up metadata locale after cookie/query miss', () => {
    expect(resolveAuthLocale([null, null, 'he-IL'])).toBe('he-IL');
    expect(resolveAuthLocale([undefined, undefined, 'en'])).toBe('en');
  });
});

describe('localeFromAuthMetadata', () => {
  it('reads locale_preference written at Hebrew sign-up', () => {
    expect(localeFromAuthMetadata({ locale_preference: 'he-IL' })).toBe('he-IL');
  });

  it('ignores unknown or missing metadata values', () => {
    expect(localeFromAuthMetadata({ locale_preference: 'fr-FR' })).toBeNull();
    expect(localeFromAuthMetadata({})).toBeNull();
    expect(localeFromAuthMetadata(null)).toBeNull();
  });
});

describe('stripLocalePrefix / safeAppPath', () => {
  it('strips supported locale prefixes so redirects stay in the active locale', () => {
    expect(stripLocalePrefix('/he-IL/onboarding')).toBe('/onboarding');
    expect(stripLocalePrefix('/en/projects')).toBe('/projects');
    expect(stripLocalePrefix('/he-IL')).toBe('/');
    expect(stripLocalePrefix('/projects')).toBe('/projects');
  });

  it('rejects absolute and protocol-relative return paths', () => {
    expect(safeAppPath('https://evil.example/phish')).toBeNull();
    expect(safeAppPath('//evil.example')).toBeNull();
    expect(safeAppPath('/he-IL/dashboard')).toBe('/dashboard');
  });

  it('preserves query strings on locale-stripped next paths', () => {
    expect(safeAppPath('/he-IL/sign-in?error=auth-callback')).toBe('/sign-in?error=auth-callback');
  });
});

describe('buildAuthCallbackUrl', () => {
  it('embeds locale so email confirmation cannot lose he-IL', () => {
    expect(buildAuthCallbackUrl('https://app.example', 'he-IL')).toBe(
      'https://app.example/auth/callback?locale=he-IL',
    );
  });

  it('includes a locale-stripped next path for password reset', () => {
    expect(buildAuthCallbackUrl('https://app.example', 'he-IL', '/en/reset-password')).toBe(
      'https://app.example/auth/callback?locale=he-IL&next=%2Freset-password',
    );
  });

  it('keeps onboarding as next without double-prefixing locale', () => {
    expect(buildAuthCallbackUrl('https://app.example', 'he-IL', '/he-IL/onboarding')).toBe(
      'https://app.example/auth/callback?locale=he-IL&next=%2Fonboarding',
    );
  });
});

describe('joinLocalizedPath', () => {
  it('builds he-IL destinations without drifting to /en', () => {
    expect(joinLocalizedPath('https://app.example', 'he-IL', '/')).toBe('https://app.example/he-IL');
    expect(joinLocalizedPath('https://app.example', 'he-IL', '/onboarding')).toBe(
      'https://app.example/he-IL/onboarding',
    );
    expect(joinLocalizedPath('https://app.example', 'he-IL', '/sign-in?error=auth-callback')).toBe(
      'https://app.example/he-IL/sign-in?error=auth-callback',
    );
  });

  it('does not double-prefix when next already includes a locale', () => {
    expect(joinLocalizedPath('https://app.example', 'he-IL', '/he-IL/onboarding')).toBe(
      'https://app.example/he-IL/onboarding',
    );
  });
});
