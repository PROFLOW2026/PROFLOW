/**
 * Universal structure model: wizard plan, numbering, multi-level units, rooms, level scope.
 * Pure domain tests (no database, no cloud): the plan only describes rows - it never creates folders.
 */
import { describe, expect, it } from 'vitest';
import { buildLocationIndex, type LocationNode } from '@/modules/project-profile/domain/locations';
import {
  emptySpec,
  makeLevels,
  nextUnitNumber,
  planStructure,
  roomTemplate,
  summarizePlan,
  validateWizardSpec,
  type WizardLevel,
  type WizardSpec,
} from '@/modules/project-profile/domain/structure-wizard';
import { levelScopeIds, suggestUnitNumber, unitLevels, validateExtraLevels } from '@/modules/project-profile/domain/unit-levels';

function spec(overrides: Partial<WizardSpec>): WizardSpec {
  return { ...emptySpec('custom'), ...overrides };
}

function levels(units: Record<string, Partial<Record<'apartment' | 'shop' | 'office' | 'penthouse' | 'house' | 'other', number>>>, counts?: { basements?: number; roof?: boolean }): WizardLevel[] {
  return makeLevels(
    { basements: counts?.basements ?? 0, ground: true, floorsAboveGround: 3, roof: counts?.roof ?? false, special: [] },
    (level) => units[level.key] ?? {},
  );
}

describe('wizard plan', () => {
  it('supports a different number of units on every level, including none on common floors', () => {
    const plan = planStructure(
      spec({
        buildings: [{ name: 'בניין א', structure: 'building', levels: levels({ g: { shop: 2 }, f1: { apartment: 3 }, f2: { apartment: 5 }, f3: {} }) }],
      }),
    );
    const summary = summarizePlan(plan);
    expect(summary.units).toBe(2 + 3 + 5);
    const byLevel = Object.fromEntries(summary.byBuilding[0]!.levels.map((l) => [l.name, l.units]));
    expect(byLevel).toMatchObject({ 'קומת קרקע': 2, 'קומה 1': 3, 'קומה 2': 5, 'קומה 3': 0 });
  });

  it('numbers units automatically and plainly, never as temporary, and never twice', () => {
    const plan = planStructure(
      spec({ buildings: [{ name: 'בניין א', structure: 'building', levels: levels({ g: { shop: 2 }, f1: { apartment: 2 }, f2: { apartment: 2 } }) }] }),
    );
    const names = plan.filter((n) => n.role === 'unit').map((n) => n.name);
    expect(names).toEqual(['חנות 1', 'חנות 2', 'דירה 1', 'דירה 2', 'דירה 3', 'דירה 4']);
    expect(new Set(names).size).toBe(names.length);
    expect(names.join(' ')).not.toMatch(/זמני/);
  });

  it('honors unitNumberStarts for sequential numbering', () => {
    const plan = planStructure(
      spec({
        unitNumberStarts: { apartment: 5 },
        buildings: [{ name: 'א', structure: 'building', levels: levels({ f1: { apartment: 2 }, f2: { apartment: 1 } }) }],
      }),
    );
    expect(plan.filter((n) => n.role === 'unit').map((n) => n.name)).toEqual(['דירה 5', 'דירה 6', 'דירה 7']);
  });

  it('supports per-level numbering', () => {
    const plan = planStructure(
      spec({ numbering: 'per_level', buildings: [{ name: 'א', structure: 'building', levels: levels({ f1: { apartment: 2 }, f2: { apartment: 2 } }) }] }),
    );
    expect(plan.filter((n) => n.role === 'unit').map((n) => n.name)).toEqual(['דירה 101', 'דירה 102', 'דירה 201', 'דירה 202']);
  });

  it('orders levels from the deepest basement to the roof', () => {
    const plan = planStructure(
      spec({ buildings: [{ name: 'א', structure: 'building', levels: levels({}, { basements: 2, roof: true }) }] }),
    );
    expect(plan.filter((n) => n.role === 'level').map((n) => n.name)).toEqual(['מרתף -2', 'מרתף -1', 'קומת קרקע', 'קומה 1', 'קומה 2', 'קומה 3', 'גג']);
  });

  it('a multi-level unit (garden flat, penthouse, duplex) is ONE row with extra levels, counted once', () => {
    const plan = planStructure(
      spec({
        buildings: [{ name: 'א', structure: 'building', levels: levels({ g: { apartment: 1 }, f1: { apartment: 1 }, f2: { penthouse: 1 } }, { basements: 1, roof: true }) }],
        multiLevel: [
          { buildingIndex: 0, levelKey: 'g', kind: 'apartment', ordinal: 1, extraLevelKeys: ['bm1'] },
          { buildingIndex: 0, levelKey: 'f2', kind: 'penthouse', ordinal: 1, extraLevelKeys: ['f3', 'r'] },
          { buildingIndex: 0, levelKey: 'f1', kind: 'apartment', ordinal: 1, extraLevelKeys: ['f2'] },
        ],
      }),
    );
    const units = plan.filter((n) => n.role === 'unit');
    expect(units).toHaveLength(3);
    expect(summarizePlan(plan).multiLevelUnits).toBe(3);
    const garden = units.find((u) => u.parentKey === 'b0/g')!;
    expect(garden.extraLevelKeys).toEqual(['b0/bm1']);
    const penthouse = units.find((u) => u.unitKind === 'penthouse')!;
    expect(penthouse.extraLevelKeys).toEqual(['b0/f3', 'b0/r']);
  });

  it('rejects a multi-level link to a level of another unit count or the primary level itself', () => {
    const base = { buildings: [{ name: 'א', structure: 'building' as const, levels: levels({ f1: { apartment: 1 } }) }] };
    expect(validateWizardSpec(spec({ ...base, multiLevel: [{ buildingIndex: 0, levelKey: 'f1', kind: 'apartment', ordinal: 2, extraLevelKeys: ['f2'] }] }))).toContain('multi_level_invalid');
    expect(validateWizardSpec(spec({ ...base, multiLevel: [{ buildingIndex: 0, levelKey: 'f1', kind: 'apartment', ordinal: 1, extraLevelKeys: ['f1'] }] }))).toContain('multi_level_invalid');
  });

  it('a private house has levels and no units; duplex houses / a compound are several houses under a site', () => {
    const plan = planStructure(
      spec({
        siteName: 'קומפלקס',
        buildings: [
          { name: 'וילה 1', structure: 'house', levels: levels({ g: { apartment: 5 } }) },
          { name: 'וילה 2', structure: 'house', levels: levels({}) },
        ],
      }),
    );
    expect(plan.filter((n) => n.role === 'unit')).toHaveLength(0);
    expect(plan.filter((n) => n.role === 'building').map((n) => n.structure)).toEqual(['house', 'house']);
    expect(plan.find((n) => n.role === 'site')).toBeTruthy();
    expect(plan.filter((n) => n.role === 'building').every((n) => n.parentKey === 'site')).toBe(true);
  });

  it('a mixed building holds shops, offices and apartments side by side', () => {
    const plan = planStructure(
      spec({ buildings: [{ name: 'א', structure: 'building', levels: levels({ g: { shop: 2, office: 1 }, f1: { apartment: 2 } }) }] }),
    );
    const kinds = plan.filter((n) => n.role === 'unit').map((n) => n.unitKind);
    expect(kinds).toEqual(expect.arrayContaining(['shop', 'office', 'apartment']));
    expect(plan.find((n) => n.name === 'חנות 1')?.type).toBe('unit');
    expect(plan.find((n) => n.name === 'דירה 1')?.type).toBe('apartment');
  });

  it('an infrastructure project needs no building, level or unit', () => {
    const plan = planStructure(emptySpec('infrastructure'));
    expect(plan.every((n) => n.role === 'area')).toBe(true);
    expect(plan.length).toBeGreaterThan(0);
  });

  it('units are created without rooms unless asked, and rooms only for residential units', () => {
    const base = { buildings: [{ name: 'א', structure: 'building' as const, levels: levels({ f1: { apartment: 2, shop: 1 } }) }] };
    expect(planStructure(spec(base)).filter((n) => n.role === 'space')).toHaveLength(0);
    const withRooms = planStructure(spec({ ...base, rooms: ['סלון', 'חדר שינה'] }));
    expect(withRooms.filter((n) => n.role === 'space')).toHaveLength(4); // 2 apartments x 2, the shop gets none
  });

  it('room templates for 2-6 rooms (living room + bedrooms)', () => {
    expect(roomTemplate(2).core).toEqual(['סלון', 'חדר שינה']);
    expect(roomTemplate(4).core).toEqual(['סלון', 'חדר שינה 1', 'חדר שינה 2', 'חדר שינה 3']);
    expect(roomTemplate(6).core).toHaveLength(6);
    expect(roomTemplate(1).core).toEqual(roomTemplate(2).core);
    expect(roomTemplate(9).core).toEqual(roomTemplate(6).core);
  });

  it('plan is parents-first and a large structure is a plan only (no cloud call exists in the model)', () => {
    const plan = planStructure(
      spec({ buildings: [{ name: 'א', structure: 'building', levels: makeLevels({ basements: 0, ground: true, floorsAboveGround: 40, roof: false, special: [] }, () => ({ apartment: 4 })) }] }),
    );
    const seen = new Set<string>();
    for (const node of plan) {
      if (node.parentKey) expect(seen.has(node.parentKey)).toBe(true);
      seen.add(node.key);
    }
    expect(plan.filter((n) => n.role === 'unit')).toHaveLength(41 * 4);
  });

  it('rejects an empty or oversized structure', () => {
    expect(validateWizardSpec(spec({ buildings: [], areas: [] }))).toContain('nothing_to_create');
    expect(validateWizardSpec(spec({ buildings: [{ name: ' ', structure: 'building', levels: [] }] }))).toContain('name_blank');
    expect(() => planStructure(spec({ buildings: [], areas: [] }))).toThrow();
  });
});

describe('numbering of units added later', () => {
  const node = (id: string, name: string, parentId: string | null, type: LocationNode['type'], extra: Partial<LocationNode> = {}): LocationNode => ({
    id,
    parentId,
    name,
    code: null,
    type,
    sortOrder: 0,
    isActive: true,
    archived: false,
    ...extra,
  });

  it('suggests the next free number, counting archived units, without renumbering anything', () => {
    const nodes = [
      node('b', 'בניין א', null, 'building'),
      node('f1', 'קומה 1', 'b', 'floor'),
      node('a1', 'דירה 1', 'f1', 'apartment'),
      node('a2', 'דירה 2', 'f1', 'apartment', { archived: true }),
      node('a9', 'דירה 9', 'f1', 'apartment'),
    ];
    expect(suggestUnitNumber(nodes, 'f1', 'apartment')).toBe(10);
    expect(suggestUnitNumber(nodes, 'f1', 'shop')).toBe(1);
    expect(nextUnitNumber('apartment', ['דירה 1', 'דירה 2', 'דירה מיוחדת'])).toBe(3);
  });

  it('keeps numbering independent per building', () => {
    const nodes = [
      node('b1', 'א', null, 'building'),
      node('f1', 'קומה 1', 'b1', 'floor'),
      node('a1', 'דירה 7', 'f1', 'apartment'),
      node('b2', 'ב', null, 'building'),
      node('f2', 'קומה 1', 'b2', 'floor'),
    ];
    expect(suggestUnitNumber(nodes, 'f2', 'apartment')).toBe(1);
  });
});

describe('unit <-> level links', () => {
  const n = (id: string, name: string, parentId: string | null, type: LocationNode['type'], extra: Partial<LocationNode> = {}): LocationNode => ({
    id,
    parentId,
    name,
    code: null,
    type,
    sortOrder: 0,
    isActive: true,
    archived: false,
    ...extra,
  });
  const nodes: LocationNode[] = [
    n('b', 'בניין א', null, 'building'),
    n('bm', 'מרתף -1', 'b', 'basement'),
    n('g', 'קרקע', 'b', 'floor'),
    n('f1', 'קומה 1', 'b', 'floor'),
    n('roof', 'גג', 'b', 'roof'),
    n('garden', 'דירת גן', 'g', 'apartment', { extraLevelIds: ['bm'] }),
    n('gardenRoom', 'מחסן', 'garden', 'room', { levelId: 'bm' }),
    n('gardenLiving', 'סלון', 'garden', 'room'),
    n('duplex', 'דירה 5', 'f1', 'apartment'),
    n('b2', 'בניין ב', null, 'building'),
    n('b2f', 'קומה 1', 'b2', 'floor'),
  ];
  const index = buildLocationIndex(nodes);

  it('lists the primary level first, then the extra levels', () => {
    expect(unitLevels(index, index.byId.get('garden')!).map((l) => l.id)).toEqual(['g', 'bm']);
  });

  it('level scope: a multi-level unit appears in every level it occupies, spaces follow their tag', () => {
    const basement = levelScopeIds(index, 'bm');
    expect(basement).toEqual(expect.arrayContaining(['bm', 'garden', 'gardenRoom']));
    expect(basement).not.toContain('gardenLiving');
    const ground = levelScopeIds(index, 'g');
    expect(ground).toEqual(expect.arrayContaining(['g', 'garden', 'gardenLiving']));
    expect(ground).not.toContain('gardenRoom');
    expect(levelScopeIds(index, 'f1')).not.toContain('garden');
  });

  it('validates extra levels: same building, a real level, not the primary one', () => {
    expect(validateExtraLevels(index, 'duplex', ['roof'])).toBeNull();
    expect(validateExtraLevels(index, 'duplex', ['f1'])).toBe('same_as_primary');
    expect(validateExtraLevels(index, 'duplex', ['b2f'])).toBe('other_building');
    expect(validateExtraLevels(index, 'duplex', ['garden'])).toBe('not_a_level');
    expect(validateExtraLevels(index, 'b', ['g'])).toBe('not_a_unit');
    expect(validateExtraLevels(index, 'duplex', ['g', 'g'])).toBe('duplicate');
    expect(validateExtraLevels(index, 'ghost', [])).toBe('not_found');
  });
});
