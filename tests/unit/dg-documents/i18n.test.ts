import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DRAWING_DISCIPLINES } from '@/modules/project-plans/domain/types';
import { LOCALES } from '@/shared/i18n/config';

type Catalog = Record<string, unknown>;

function load(locale: string): Catalog {
  return JSON.parse(readFileSync(join(process.cwd(), 'src/locales', locale, 'projectPlans.json'), 'utf8')) as Catalog;
}

function flatten(catalog: Catalog, prefix = ''): string[] {
  return Object.entries(catalog).flatMap(([key, value]) =>
    value && typeof value === 'object' ? flatten(value as Catalog, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

describe('projectPlans messages', () => {
  const he = load('he-IL');

  it('has the same keys in every locale (Hebrew is the reference)', () => {
    const reference = flatten(he).sort();
    for (const locale of LOCALES) {
      expect({ locale, keys: flatten(load(locale)).sort() }).toEqual({ locale, keys: reference });
    }
  });

  it('labels every drawing discipline in each locale', () => {
    for (const locale of LOCALES) {
      const catalog = load(locale);
      for (const discipline of DRAWING_DISCIPLINES) {
        expect(catalog).toHaveProperty(`register.discipline.${discipline}`);
        expect(catalog).toHaveProperty(`create.discipline.${discipline}`);
      }
    }
  });
});
