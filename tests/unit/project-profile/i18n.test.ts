import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONSTRUCTION_CATEGORIES, CONSTRUCTION_METHODS, EMPTY_CHARACTERISTICS } from '@/modules/project-profile/domain/characteristics';
import { LOCATION_TYPES } from '@/modules/project-profile/domain/locations';
import { OPERATING_ROLES, OWNERSHIP_MODELS } from '@/modules/project-profile/domain/profile';
import { RECOMMENDATION_KINDS, REASON_CODES, recommend } from '@/modules/project-profile/domain/recommendations';
import { LOCALES } from '@/shared/i18n/config';

type Catalog = Record<string, unknown>;

function load(locale: string): Catalog {
  return JSON.parse(readFileSync(join(process.cwd(), 'src/locales', locale, 'projectProfile.json'), 'utf8')) as Catalog;
}

function get(catalog: Catalog, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node as Catalog | undefined)?.[key], catalog);
}

function flatten(catalog: Catalog, prefix = ''): string[] {
  return Object.entries(catalog).flatMap(([key, value]) =>
    value && typeof value === 'object' ? flatten(value as Catalog, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

/** Every rule fires for at least one of these inputs. */
const ALL_RULE_INPUTS = [
  { profile: { operatingRoles: [...OPERATING_ROLES] }, characteristics: { ...EMPTY_CHARACTERISTICS, category: 'residential' as const, constructionMethod: 'cast_in_place' as const, buildingsCount: 3, floorsAboveGround: 12, floorsBelowGround: 2, residentialUnits: 50, commercialUnits: 5, parkingLevels: 2, hasPublicAreas: true, siteAreaSqm: '1000' } },
  { profile: { operatingRoles: ['general_contractor' as const] }, characteristics: { ...EMPTY_CHARACTERISTICS, category: 'office' as const, floorsAboveGround: 5 } },
  ...(['precast', 'steel_structure', 'timber'] as const).map((method) => ({ profile: { operatingRoles: [] }, characteristics: { ...EMPTY_CHARACTERISTICS, category: 'industrial' as const, constructionMethod: method, floorsAboveGround: 2 } })),
  { profile: { operatingRoles: [] }, characteristics: { ...EMPTY_CHARACTERISTICS, category: 'infrastructure' as const } },
  { profile: { operatingRoles: [] }, characteristics: { ...EMPTY_CHARACTERISTICS, category: 'renovation' as const, floorsAboveGround: 2 } },
];

describe('projectProfile messages', () => {
  const he = load('he-IL');

  it('has the same keys in every locale (Hebrew is the reference)', () => {
    const reference = flatten(he).sort();
    for (const locale of LOCALES) {
      expect({ locale, keys: flatten(load(locale)).sort() }).toEqual({ locale, keys: reference });
    }
  });

  it('labels every recommendation, reason, kind, role, category, method and location type', () => {
    const codes = new Set<string>();
    for (const input of ALL_RULE_INPUTS) for (const item of recommend(input)) codes.add(`${item.kind}.${item.code}`);
    expect(codes.size).toBeGreaterThan(90);
    for (const locale of LOCALES) {
      const catalog = load(locale);
      const required = [
        ...[...codes].map((code) => `recommendations.items.${code}`),
        ...REASON_CODES.map((reason) => `reasons.${reason}`),
        ...RECOMMENDATION_KINDS.map((kind) => `recommendations.kinds.${kind}`),
        ...OPERATING_ROLES.map((role) => `profile.roles.${role}`),
        ...OWNERSHIP_MODELS.map((model) => `profile.ownership.${model}`),
        ...CONSTRUCTION_CATEGORIES.map((category) => `characteristics.categories.${category}`),
        ...CONSTRUCTION_METHODS.map((method) => `characteristics.methods.${method}`),
        ...LOCATION_TYPES.map((type) => `locationTypes.${type}`),
      ];
      const missing = required.filter((path) => typeof get(catalog, path) !== 'string');
      expect({ locale, missing }).toEqual({ locale, missing: [] });
    }
  });

  it('keeps {n} in generator labels so the generator can number nodes', () => {
    for (const locale of LOCALES) {
      const labels = get(load(locale), 'generator.labels') as Record<string, string>;
      for (const key of ['building', 'floor', 'basement', 'parking', 'apartment', 'unit']) {
        expect({ locale, key, ok: labels[key]!.includes('{n}') }).toEqual({ locale, key, ok: true });
      }
    }
  });
});
