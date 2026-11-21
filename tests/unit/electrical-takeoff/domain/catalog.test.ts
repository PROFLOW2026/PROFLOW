import { describe, expect, it } from 'vitest';

import {
  allocateCustomTypeKey,
  applyOrgDisplayName,
  archivedCatalogKeys,
  assertCatalogIntegrity,
  buildCustomCatalogType,
  catalogForWorker,
  findActiveNameDuplicate,
  loadDefaultCatalog,
  mergeCatalog,
  mergeOrgCatalog,
  normalizeCatalogNameHe,
  pickerCatalog,
} from '@/modules/electrical-takeoff/domain/catalog';
import { freezeApprovedBoq } from '@/modules/electrical-takeoff/domain/approved-boq';
import type { Boq } from '@/modules/electrical-takeoff/domain/contracts';

describe('catalog', () => {
  it('validates default catalog keys, Hebrew names, colours', () => {
    const types = loadDefaultCatalog();
    expect(types.length).toBeGreaterThanOrEqual(80);
    assertCatalogIntegrity(types);
    expect(types.some((type) => type.key === 'control.stair_button')).toBe(true);
    expect(types.some((type) => type.key === 'power.shutter_feed')).toBe(true);
    expect(types.some((type) => type.key === 'control.shutter' && type.nameHe === 'מפסק תריס')).toBe(true);
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

  it('keeps archived types for historical labels and hides them from the picker', () => {
    const merged = mergeOrgCatalog([
      {
        key: 'custom.control.stair',
        archived: true,
        payload: {
          key: 'custom.control.stair',
          category: 'control',
          role: 'device',
          nameHe: 'לחצן חדר מדרגות',
          unit: "יח'",
          keywordsHe: [],
          colorHex: '#7f7f7f',
          builtIn: false,
          archived: true,
        },
      },
    ]);
    expect(merged.find((type) => type.key === 'custom.control.stair')?.nameHe).toBe('לחצן חדר מדרגות');
    expect(pickerCatalog(merged).some((type) => type.key === 'custom.control.stair')).toBe(false);
    expect(pickerCatalog(merged, 'custom.control.stair').some((type) => type.key === 'custom.control.stair')).toBe(
      true,
    );
  });

  it('renames display without changing the stable key', () => {
    const created = buildCustomCatalogType({
      category: 'control',
      nameHe: 'לחצן חדר מדרגות',
      catalog: loadDefaultCatalog(),
      key: 'custom.control.aaaaaaaaaaaa',
    });
    const renamed = applyOrgDisplayName(created, 'לחצן מדרגות');
    expect(renamed.key).toBe(created.key);
    expect(renamed.nameHe).toBe('לחצן מדרגות');
  });

  it('normalizes Hebrew, Unicode spaces, NFC, and missing names like SQL 0216', () => {
    expect(normalizeCatalogNameHe('  לחצן   חדר מדרגות ')).toBe('לחצן חדר מדרגות');
    expect(normalizeCatalogNameHe('לחצן\u00A0חדר מדרגות')).toBe('לחצן חדר מדרגות');
    expect(normalizeCatalogNameHe('\u05E9\u05C1\u05DC\u05D5\u05DD')).toBe(
      '\u05E9\u05C1\u05DC\u05D5\u05DD'.normalize('NFC'),
    );
    expect(normalizeCatalogNameHe('')).toBe('');
    expect(normalizeCatalogNameHe('   ')).toBe('');
    expect(normalizeCatalogNameHe('\u00A0')).toBe('');
  });

  it('rejects duplicate normalized names among active types', () => {
    const catalog = mergeCatalog({
      customTypes: [
        buildCustomCatalogType({
          category: 'control',
          nameHe: 'לחצן דירה ייעודי',
          catalog: loadDefaultCatalog(),
          key: 'custom.control.aaaaaaaaaaaa',
        }),
      ],
    });
    expect(findActiveNameDuplicate(catalog, '  לחצן   דירה ייעודי ' )?.key).toBe('custom.control.aaaaaaaaaaaa');
    expect(findActiveNameDuplicate(catalog, 'מפסק יחיד')?.key).toBe('control.switch.single');
  });

  it('does not send custom keywords to the worker and drops archived types', () => {
    const merged = mergeOrgCatalog([
      {
        key: 'custom.control.stair',
        archived: false,
        payload: {
          key: 'custom.control.stair',
          category: 'control',
          role: 'device',
          nameHe: 'לחצן חדר מדרגות',
          unit: "יח'",
          keywordsHe: ['לחצן חדר מדרגות', 'לחצן'],
          colorHex: '#7f7f7f',
          builtIn: false,
          archived: false,
        },
      },
      {
        key: 'custom.control.old',
        archived: true,
        payload: {
          key: 'custom.control.old',
          category: 'control',
          role: 'device',
          nameHe: 'ישן',
          unit: "יח'",
          keywordsHe: ['ישן'],
          colorHex: '#7f7f7f',
          builtIn: false,
          archived: true,
        },
      },
    ]);
    const worker = catalogForWorker(merged);
    const custom = worker.find((type) => type.key === 'custom.control.stair');
    expect(custom?.keywordsHe).toEqual([]);
    expect(worker.some((type) => type.key === 'custom.control.old')).toBe(false);
    const builtin = worker.find((type) => type.key === 'control.switch.single');
    expect(builtin?.keywordsHe.length).toBeGreaterThan(0);
    expect(archivedCatalogKeys(merged).has('custom.control.old')).toBe(true);
  });

  it('allocates a stable custom key in the category namespace', () => {
    expect(allocateCustomTypeKey('control', 'abcd1234ef90')).toBe('custom.control.abcd1234ef90');
    expect(normalizeCatalogNameHe('  לחצן\u00a0חדר  ')).toBe('לחצן חדר');
  });
});

describe('freezeApprovedBoq', () => {
  const live: Boq = {
    lines: [
      {
        key: 'device_count|custom.control.stair|null|null|default',
        typeKey: 'custom.control.stair',
        label: 'שם חדש',
        category: 'control',
        lineKind: 'device_count',
        unit: "יח'",
        quantity: 3,
        floor: null,
        areaId: null,
        ruleId: 'default',
        detectionIds: ['d1'],
        breakdown: { high: 3, medium: 0, low: 0, unclassified: 0, userAdded: 0, userConfirmed: 3 },
        verified: true,
        excluded: false,
      },
    ],
    unclassifiedCount: 0,
    needsReviewCount: 0,
    completeness: {
      sheetsTotal: 1,
      sheetsFullyAnalyzed: 1,
      partialSheets: [],
      skippedSheets: [],
      xrefsMissing: [],
      scaleUnverifiedSheets: [],
    },
    warnings: [],
    state: 'approved',
  };

  it('keeps snapshot labels instead of the live catalog rename', () => {
    const frozen = freezeApprovedBoq(
      {
        ...live,
        lines: [{ ...live.lines[0], label: 'לחצן חדר מדרגות' }],
      },
      live,
    );
    expect(frozen.lines[0]?.label).toBe('לחצן חדר מדרגות');
    expect(frozen.state).toBe('approved');
  });
});
