import { describe, expect, it } from 'vitest';

import { assertCatalogIntegrity, loadDefaultCatalog, mergeCatalog } from '@/modules/electrical-takeoff/domain/catalog';

describe('catalog', () => {
  it('validates default catalog keys, Hebrew names, colours', () => {
    const types = loadDefaultCatalog();
    expect(types.length).toBeGreaterThanOrEqual(80);
    assertCatalogIntegrity(types);
    const keys = new Set(types.map((t) => t.key));
    expect(keys.size).toBe(types.length);
    for (const t of types) {
      expect(t.nameHe.length).toBeGreaterThan(0);
      expect(t.colorHex).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('merges org custom types', () => {
    const merged = mergeCatalog({
      customTypes: [
        {
          key: 'custom.planner.socket',
          category: 'power',
          role: 'device',
          nameHe: 'שקע משרדי',
          unit: "יח'",
          keywordsHe: ['שקע משרדי'],
          colorHex: '#112233',
          builtIn: false,
          archived: false,
        },
      ],
    });
    expect(merged.some((t) => t.key === 'custom.planner.socket')).toBe(true);
  });
});