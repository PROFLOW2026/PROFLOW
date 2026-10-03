import type { LocationType } from './locations';

/**
 * Bulk location generator ("3 buildings x 8 floors x 4 apartments"). Pure: produces a plan
 * that the application layer inserts level by level. Names come from caller-supplied label
 * templates (already translated) so stored names match the user's language.
 */

export const GENERATOR_LIMITS = {
  buildings: 50,
  floorsAboveGround: 100,
  floorsBelowGround: 10,
  unitsPerFloor: 60,
  maxNodes: 5000,
} as const;

export type BuildingCodeStyle = 'letters' | 'numbers';
export type UnitNumbering = 'per_building' | 'per_floor';
export type GeneratedUnitType = Extract<LocationType, 'apartment' | 'unit'>;

export interface LocationGeneratorSpec {
  readonly buildings: number;
  readonly buildingCodeStyle: BuildingCodeStyle;
  readonly floorsAboveGround: number;
  readonly floorsBelowGround: number;
  readonly includeGroundFloor: boolean;
  readonly unitsPerFloor: number;
  readonly unitType: GeneratedUnitType;
  readonly unitsOnGroundFloor: boolean;
  readonly unitNumbering: UnitNumbering;
  /** Underground levels are typed `parking` instead of `basement`. */
  readonly undergroundAsParking: boolean;
  readonly includeRoof: boolean;
}

/** Templates with `{n}` placeholder (roof / ground take none). */
export interface LocationGeneratorLabels {
  readonly building: string;
  readonly floor: string;
  readonly groundFloor: string;
  readonly basement: string;
  readonly parking: string;
  readonly roof: string;
  readonly apartment: string;
  readonly unit: string;
}

export interface GeneratedLocation {
  /** Stable plan-local key, e.g. `b1/f03/u12`. */
  readonly key: string;
  readonly parentKey: string | null;
  readonly depth: number;
  readonly type: LocationType;
  readonly name: string;
  readonly code: string;
  readonly sortOrder: number;
}

export type GeneratorIssue =
  | 'buildings_range'
  | 'floors_above_range'
  | 'floors_below_range'
  | 'units_range'
  | 'no_floors'
  | 'too_many_nodes';

export function validateGeneratorSpec(spec: LocationGeneratorSpec): GeneratorIssue[] {
  const issues: GeneratorIssue[] = [];
  const int = (value: number, max: number, min = 0) => Number.isInteger(value) && value >= min && value <= max;
  if (!int(spec.buildings, GENERATOR_LIMITS.buildings, 1)) issues.push('buildings_range');
  if (!int(spec.floorsAboveGround, GENERATOR_LIMITS.floorsAboveGround)) issues.push('floors_above_range');
  if (!int(spec.floorsBelowGround, GENERATOR_LIMITS.floorsBelowGround)) issues.push('floors_below_range');
  if (!int(spec.unitsPerFloor, GENERATOR_LIMITS.unitsPerFloor)) issues.push('units_range');
  if (
    issues.length === 0 &&
    spec.floorsAboveGround === 0 &&
    spec.floorsBelowGround === 0 &&
    !spec.includeGroundFloor &&
    !spec.includeRoof
  ) {
    issues.push('no_floors');
  }
  if (issues.length === 0 && countGeneratedNodes(spec) > GENERATOR_LIMITS.maxNodes) {
    issues.push('too_many_nodes');
  }
  return issues;
}

/** Node count without building the plan (used for the live preview and the limit). */
export function countGeneratedNodes(spec: LocationGeneratorSpec): number {
  const floorsWithUnits = spec.floorsAboveGround + (spec.includeGroundFloor && spec.unitsOnGroundFloor ? 1 : 0);
  const floors =
    spec.floorsAboveGround + spec.floorsBelowGround + (spec.includeGroundFloor ? 1 : 0) + (spec.includeRoof ? 1 : 0);
  return spec.buildings * (1 + floors + floorsWithUnits * spec.unitsPerFloor);
}

export function fillLabel(template: string, n: number | string): string {
  return template.includes('{n}') ? template.split('{n}').join(String(n)) : `${template} ${n}`.trim();
}

export function buildingCode(index: number, style: BuildingCodeStyle): string {
  if (style === 'numbers') return String(index);
  // 1 -> A, 26 -> Z, 27 -> AA
  let n = index;
  let code = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    code = String.fromCharCode(65 + rem) + code;
    n = Math.floor((n - 1) / 26);
  }
  return code;
}

function pad2(n: number): string {
  return String(Math.abs(n)).padStart(2, '0');
}

interface PlannedFloor {
  readonly level: number; // negative = underground, 0 = ground
  readonly type: LocationType;
  readonly name: string;
  readonly code: string;
  readonly withUnits: boolean;
}

function planFloors(spec: LocationGeneratorSpec, labels: LocationGeneratorLabels): PlannedFloor[] {
  const floors: PlannedFloor[] = [];
  for (let depth = spec.floorsBelowGround; depth >= 1; depth -= 1) {
    const parking = spec.undergroundAsParking;
    floors.push({
      level: -depth,
      type: parking ? 'parking' : 'basement',
      name: fillLabel(parking ? labels.parking : labels.basement, -depth),
      code: `${parking ? 'P' : 'B'}${pad2(depth)}`,
      withUnits: false,
    });
  }
  if (spec.includeGroundFloor) {
    floors.push({
      level: 0,
      type: 'floor',
      name: labels.groundFloor,
      code: 'F00',
      withUnits: spec.unitsOnGroundFloor,
    });
  }
  for (let level = 1; level <= spec.floorsAboveGround; level += 1) {
    floors.push({
      level,
      type: 'floor',
      name: fillLabel(labels.floor, level),
      code: `F${pad2(level)}`,
      withUnits: true,
    });
  }
  if (spec.includeRoof) {
    floors.push({ level: Number.MAX_SAFE_INTEGER, type: 'roof', name: labels.roof, code: 'RF', withUnits: false });
  }
  return floors;
}

/**
 * Deterministic plan: buildings -> floors (underground first, then ground, then up, then roof)
 * -> units. Codes are unique among siblings (the DB unique index is per parent).
 */
export function planLocationTree(
  spec: LocationGeneratorSpec,
  labels: LocationGeneratorLabels,
): GeneratedLocation[] {
  const issues = validateGeneratorSpec(spec);
  if (issues.length > 0) throw new Error(`Invalid generator spec: ${issues.join(',')}`);

  const plan: GeneratedLocation[] = [];
  const floors = planFloors(spec, labels);
  const unitLabel = spec.unitType === 'apartment' ? labels.apartment : labels.unit;

  for (let b = 1; b <= spec.buildings; b += 1) {
    const bCode = buildingCode(b, spec.buildingCodeStyle);
    const buildingKey = `b${b}`;
    plan.push({
      key: buildingKey,
      parentKey: null,
      depth: 0,
      type: 'building',
      name: fillLabel(labels.building, bCode),
      code: bCode,
      sortOrder: b - 1,
    });

    let running = 0;
    floors.forEach((floor, floorIndex) => {
      const floorKey = `${buildingKey}/${floor.code.toLowerCase()}`;
      plan.push({
        key: floorKey,
        parentKey: buildingKey,
        depth: 1,
        type: floor.type,
        name: floor.name,
        code: floor.code,
        sortOrder: floorIndex,
      });
      if (!floor.withUnits) return;
      for (let u = 1; u <= spec.unitsPerFloor; u += 1) {
        running += 1;
        const number = spec.unitNumbering === 'per_building' ? running : floor.level * 100 + u;
        plan.push({
          key: `${floorKey}/u${u}`,
          parentKey: floorKey,
          depth: 2,
          type: spec.unitType,
          name: fillLabel(unitLabel, number),
          code: String(number),
          sortOrder: u - 1,
        });
      }
    });
  }
  return plan;
}

/** Plan grouped by depth (parents always before children) for level-by-level inserts. */
export function planLevels(plan: readonly GeneratedLocation[]): GeneratedLocation[][] {
  const levels: GeneratedLocation[][] = [];
  for (const node of plan) {
    (levels[node.depth] ??= []).push(node);
  }
  return levels;
}
