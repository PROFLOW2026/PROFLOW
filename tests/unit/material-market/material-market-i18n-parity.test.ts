import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES = ['en', 'he-IL', 'ar', 'ru'] as const;

const REQUIRED_KEYS = [
  'trades.concrete',
  'pendingScore',
  'pendingDescription',
  'banner.title',
  'banner.disclaimer',
  'banner.pressure.low',
  'banner.pressure.medium',
  'banner.pressure.high',
  'supplierCoverage',
  'drivers.cbsCement',
  'drivers.cbsConcrete',
] as const;

function readLocale(locale: (typeof LOCALES)[number]): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.resolve(`src/locales/${locale}/materialMarket.json`), 'utf8'),
  ) as Record<string, unknown>;
}

function getNested(obj: Record<string, unknown>, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

describe('materialMarket i18n parity', () => {
  for (const locale of LOCALES) {
    it(`includes required keys in ${locale}`, () => {
      const messages = readLocale(locale);
      for (const key of REQUIRED_KEYS) {
        expect(getNested(messages, key), `${locale}:${key}`).toBeTruthy();
      }
    });
  }
});
