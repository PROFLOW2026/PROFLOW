import { describe, expect, it } from 'vitest';
import { loadDefaultCatalog, mergeOrgCatalog } from '@/modules/electrical-takeoff/domain/catalog';
import { filterCatalog } from '@/modules/electrical-takeoff/ui/review-guide';

describe('filterCatalog', () => {
  it('hides archived types unless they are the current selection', () => {
    const catalog = mergeOrgCatalog([
      {
        key: 'custom.control.old',
        archived: true,
        payload: {
          key: 'custom.control.old',
          category: 'control',
          role: 'device',
          nameHe: 'ישן',
          unit: "יח'",
          keywordsHe: [],
          colorHex: '#7f7f7f',
          builtIn: false,
          archived: true,
        },
      },
    ]);
    expect(filterCatalog(catalog, 'control', '', '').some((type) => type.key === 'custom.control.old')).toBe(false);
    expect(
      filterCatalog(catalog, 'control', '', 'custom.control.old').some((type) => type.key === 'custom.control.old'),
    ).toBe(true);
  });

  it('finds built-in types by Hebrew keyword', () => {
    const catalog = loadDefaultCatalog();
    const hits = filterCatalog(catalog, 'control', 'מפסק יחיד', '');
    expect(hits.some((type) => type.key === 'control.switch.single')).toBe(true);
  });
});
