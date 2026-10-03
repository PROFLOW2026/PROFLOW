import { describe, expect, it } from 'vitest';
import { PROJECT_LOCATION_TYPES } from '@drizzle/schema';
import {
  GENERATOR_LIMITS,
  buildingCode,
  countGeneratedNodes,
  fillLabel,
  planLevels,
  planLocationTree,
  validateGeneratorSpec,
  type LocationGeneratorLabels,
  type LocationGeneratorSpec,
} from '@/modules/project-profile/domain/location-generator';
import {
  LOCATION_TYPES,
  buildLocationIndex,
  collectSubtreeIds,
  filterLocationEntries,
  flattenLocationTree,
  formatLocationCodePath,
  formatLocationLabel,
  locationDepth,
  nextSiblingSortOrder,
  wouldCreateCycle,
  type LocationNode,
} from '@/modules/project-profile/domain/locations';

const LABELS: LocationGeneratorLabels = {
  building: 'בניין {n}',
  floor: 'קומה {n}',
  groundFloor: 'קומת קרקע',
  basement: 'מרתף {n}',
  parking: 'חניון {n}',
  roof: 'גג',
  apartment: 'דירה {n}',
  unit: 'יחידה {n}',
};

const BASE_SPEC: LocationGeneratorSpec = {
  buildings: 3,
  buildingCodeStyle: 'letters',
  floorsAboveGround: 8,
  floorsBelowGround: 0,
  includeGroundFloor: false,
  unitsPerFloor: 4,
  unitType: 'apartment',
  unitsOnGroundFloor: false,
  unitNumbering: 'per_building',
  undergroundAsParking: false,
  includeRoof: false,
};

function node(id: string, parentId: string | null, name: string, extra: Partial<LocationNode> = {}): LocationNode {
  return { id, parentId, name, code: null, type: 'area', sortOrder: 0, isActive: true, archived: false, ...extra };
}

describe('location generator', () => {
  it('builds "3 buildings x 8 floors x 4 apartments"', () => {
    const plan = planLocationTree(BASE_SPEC, LABELS);
    expect(plan).toHaveLength(3 * (1 + 8 + 8 * 4));
    expect(countGeneratedNodes(BASE_SPEC)).toBe(plan.length);
    const buildings = plan.filter((n) => n.type === 'building');
    expect(buildings.map((b) => [b.name, b.code])).toEqual([
      ['בניין A', 'A'],
      ['בניין B', 'B'],
      ['בניין C', 'C'],
    ]);
    const apartmentsOfB = plan.filter((n) => n.type === 'apartment' && n.key.startsWith('b2/'));
    expect(apartmentsOfB).toHaveLength(32);
    expect(apartmentsOfB[0]!.name).toBe('דירה 1');
    expect(apartmentsOfB.at(-1)!.name).toBe('דירה 32');
  });

  it('is deterministic and keeps codes unique among siblings', () => {
    const spec: LocationGeneratorSpec = {
      ...BASE_SPEC,
      floorsBelowGround: 2,
      includeGroundFloor: true,
      unitsOnGroundFloor: true,
      undergroundAsParking: true,
      includeRoof: true,
      unitNumbering: 'per_floor',
    };
    const a = planLocationTree(spec, LABELS);
    expect(planLocationTree(spec, LABELS)).toEqual(a);
    const byParent = new Map<string | null, string[]>();
    for (const n of a) byParent.set(n.parentKey, [...(byParent.get(n.parentKey) ?? []), n.code.toLowerCase()]);
    for (const codes of byParent.values()) expect(new Set(codes).size).toBe(codes.length);
    const floorsOfA = a.filter((n) => n.parentKey === 'b1').map((n) => n.name);
    expect(floorsOfA).toEqual(['חניון -2', 'חניון -1', 'קומת קרקע', ...Array.from({ length: 8 }, (_, i) => `קומה ${i + 1}`), 'גג']);
    expect(a.find((n) => n.key === 'b1/f03/u2')!.name).toBe('דירה 302');
    expect(a.find((n) => n.key === 'b1/f00/u1')!.name).toBe('דירה 1');
  });

  it('orders levels parents-first', () => {
    const levels = planLevels(planLocationTree(BASE_SPEC, LABELS));
    expect(levels.map((level) => level.length)).toEqual([3, 24, 96]);
    expect(levels[0]!.every((n) => n.parentKey === null)).toBe(true);
  });

  it('validates limits', () => {
    expect(validateGeneratorSpec(BASE_SPEC)).toEqual([]);
    expect(validateGeneratorSpec({ ...BASE_SPEC, buildings: 0 })).toEqual(['buildings_range']);
    expect(validateGeneratorSpec({ ...BASE_SPEC, floorsAboveGround: 0 })).toEqual(['no_floors']);
    expect(
      validateGeneratorSpec({ ...BASE_SPEC, buildings: 50, floorsAboveGround: 100, unitsPerFloor: 60 }),
    ).toEqual(['too_many_nodes']);
    expect(() => planLocationTree({ ...BASE_SPEC, buildings: GENERATOR_LIMITS.buildings + 1 }, LABELS)).toThrow();
  });

  it('formats building codes and labels', () => {
    expect([1, 26, 27, 52].map((n) => buildingCode(n, 'letters'))).toEqual(['A', 'Z', 'AA', 'AZ']);
    expect(buildingCode(7, 'numbers')).toBe('7');
    expect(fillLabel('Floor {n}', 3)).toBe('Floor 3');
    expect(fillLabel('Floor', 3)).toBe('Floor 3');
  });
});

describe('location tree helpers', () => {
  const nodes = [
    node('site', null, 'Site', { code: 'S', type: 'site' }),
    node('b1', 'site', 'Building A', { code: 'A', type: 'building', sortOrder: 0 }),
    node('b2', 'site', 'Building B', { code: 'B', type: 'building', sortOrder: 1 }),
    node('f1', 'b1', 'Floor 1', { code: 'F01', type: 'floor' }),
    node('a12', 'f1', 'Apt 12', { code: '12', type: 'apartment' }),
    node('old', 'b2', 'Old wing', { archived: true }),
    node('orphan', 'missing', 'Orphan', { sortOrder: 9 }),
  ];
  const index = buildLocationIndex(nodes);

  it('formats full-path labels', () => {
    expect(formatLocationLabel(index, 'a12')).toBe('Site › Building A › Floor 1 › Apt 12');
    expect(formatLocationLabel(index, 'a12', { separator: ' / ', leafOnly: true })).toBe('Apt 12');
    expect(formatLocationLabel(index, 'b1', { withCode: true })).toBe('Site (S) › Building A (A)');
    expect(formatLocationLabel(index, 'nope')).toBeNull();
    expect(formatLocationLabel(index, null)).toBeNull();
    expect(formatLocationCodePath(index, 'a12')).toBe('S-A-F01-12');
    expect(formatLocationCodePath(index, 'old')).toBeNull();
  });

  it('flattens depth-first and hides archived by default', () => {
    const flat = flattenLocationTree(index);
    expect(flat.map((entry) => [entry.node.id, entry.depth])).toEqual([
      ['site', 0],
      ['b1', 1],
      ['f1', 2],
      ['a12', 3],
      ['b2', 1],
      ['orphan', 0],
    ]);
    expect(flattenLocationTree(index, { includeInactive: true }).map((e) => e.node.id)).toContain('old');
    expect(filterLocationEntries(flat, 'apt').map((e) => e.node.id)).toEqual(['a12']);
    expect(filterLocationEntries(flat, 'f01').map((e) => e.node.id)).toEqual(['f1']);
  });

  it('detects cycles, depth and subtrees', () => {
    expect(wouldCreateCycle(index, 'b1', 'a12')).toBe(true);
    expect(wouldCreateCycle(index, 'b1', 'b1')).toBe(true);
    expect(wouldCreateCycle(index, 'a12', 'b2')).toBe(false);
    expect(wouldCreateCycle(index, 'a12', null)).toBe(false);
    expect(locationDepth(index, 'a12')).toBe(3);
    expect(collectSubtreeIds(index, 'b1').sort()).toEqual(['a12', 'b1', 'f1']);
    expect(nextSiblingSortOrder(index, 'site')).toBe(2);
    expect(nextSiblingSortOrder(index, 'a12')).toBe(0);
  });

  it('matches the foundation location types', () => {
    expect([...LOCATION_TYPES]).toEqual([...PROJECT_LOCATION_TYPES]);
  });
});
