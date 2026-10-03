import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideContractorSurface, safeContractorNext } from '@/modules/contractor-access/domain/surface';
import { GRANT_TEMPLATE_KEYS } from '@/modules/contractor-access/domain/grant-policy';
import { ALL_EXTERNAL_CAPABILITIES } from '@/shared/external';
import { LOCALES } from '@/shared/i18n/config';

const locales = ['he-IL', 'en', 'ar', 'ru'];
const contractor = { appMetadata: { pf_principal: 'contractor' } };
const internal = { appMetadata: { provider: 'email' } };

function decide(pathname: string, user: { appMetadata: unknown } | null, search = '') {
  return decideContractorSurface({ pathname, search, locales, defaultLocale: 'he-IL', user });
}

describe('contractor surface separation (proxy)', () => {
  it('keeps contractor accounts out of the org app', () => {
    expect(decide('/he-IL/dashboard', contractor)).toEqual({ kind: 'redirect', pathname: '/he-IL/contractor' });
    expect(decide('/en/onboarding', contractor)).toEqual({ kind: 'redirect', pathname: '/en/contractor' });
    expect(decide('/en/employee', contractor)).toEqual({ kind: 'redirect', pathname: '/en/contractor' });
    expect(decide('/en/contractor/account', contractor)).toEqual({ kind: 'pass' });
    expect(decide('/en/legal/privacy', contractor)).toEqual({ kind: 'pass' });
  });

  it('never requires org membership on /contractor and sends anonymous users to contractor sign-in', () => {
    expect(decide('/en/contractor/sign-in', null)).toEqual({ kind: 'pass' });
    expect(decide('/en/contractor/activate', null, '?token=x')).toEqual({ kind: 'pass' });
    expect(decide('/en/contractor/projects/1', null, '?tab=a')).toEqual({
      kind: 'redirect',
      pathname: '/en/contractor/sign-in',
      search: `?next=${encodeURIComponent('/en/contractor/projects/1?tab=a')}`,
    });
    expect(decide('/en/contractor', internal)).toEqual({ kind: 'pass' });
    expect(decide('/en/dashboard', internal)).toEqual({ kind: 'pass' });
  });

  it('only honours same-surface post sign-in targets', () => {
    expect(safeContractorNext('/en/contractor/projects/1', 'en')).toBe('/en/contractor/projects/1');
    expect(safeContractorNext('https://evil.test', 'en')).toBe('/en/contractor');
    expect(safeContractorNext('//evil.test/contractor', 'en')).toBe('/en/contractor');
    expect(safeContractorNext('/en/dashboard', 'en')).toBe('/en/contractor');
    expect(safeContractorNext('/en/contractor/sign-in', 'he-IL')).toBe('/he-IL/contractor');
  });
});

function flatten(value: unknown, prefix = ''): string[] {
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
      flatten(entry, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

describe('contractorAccess locale catalogs', () => {
  const catalogs = Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      JSON.parse(readFileSync(path.resolve(process.cwd(), `src/locales/${locale}/contractorAccess.json`), 'utf8')),
    ]),
  );

  it('has the same keys in all four locales and no empty strings', () => {
    const reference = flatten(catalogs.en).sort();
    expect(reference.length).toBeGreaterThan(100);
    for (const locale of LOCALES) {
      expect(flatten(catalogs[locale]).sort()).toEqual(reference);
      const json = JSON.stringify(catalogs[locale]);
      expect(json).not.toContain('""');
    }
  });

  it('labels every external capability and template', () => {
    const en = catalogs.en as { manage: { capabilities: Record<string, string>; templates: Record<string, unknown> } };
    for (const capability of ALL_EXTERNAL_CAPABILITIES) {
      expect(en.manage.capabilities[capability.replaceAll('.', '_')], capability).toBeTruthy();
    }
    for (const template of [...GRANT_TEMPLATE_KEYS, 'custom']) {
      expect(en.manage.templates[template], template).toBeTruthy();
    }
  });
});
