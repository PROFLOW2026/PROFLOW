/**
 * Universal structure wizard (pure, client-safe): one model for residential buildings, villas, compounds,
 * commercial / mixed buildings and infrastructure sites.
 *
 *   site (optional) > building / house > level > unit > space (room)
 *
 * - A unit is ONE location row (stable id) under its PRIMARY level. A multi-level unit (garden flat,
 *   penthouse, duplex, ...) lists its additional levels in `metadata.extraLevelIds`; it is never copied
 *   to another level, so it is counted once and owns one storage folder.
 * - Numbering is automatic and sequential ("דירה 1", "דירה 2", "חנות 1", ...). Nothing is ever called
 *   "temporary", and existing units are never renumbered.
 * - The plan only describes database rows. No cloud folder is created for any of them.
 */
import type { LocationType } from './locations';

export const UNIT_KINDS = ['apartment', 'penthouse', 'house', 'shop', 'office', 'other'] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

export const UNIT_KIND_LABELS: Readonly<Record<UnitKind, string>> = {
  apartment: 'דירה',
  penthouse: 'פנטהאוז',
  house: 'בית',
  shop: 'חנות',
  office: 'משרד',
  other: 'יחידה',
};

export const RESIDENTIAL_UNIT_KINDS: readonly UnitKind[] = ['apartment', 'penthouse', 'house'];

/** `project_locations.type` allows no shop / office, so those are plain `unit` rows with `metadata.unitKind`. */
export function unitLocationType(kind: UnitKind): LocationType {
  return kind === 'apartment' || kind === 'penthouse' ? 'apartment' : 'unit';
}

export const WIZARD_TEMPLATES = ['residential', 'house', 'commercial', 'mixed', 'infrastructure', 'custom'] as const;
export type WizardTemplate = (typeof WIZARD_TEMPLATES)[number];

export const WIZARD_LIMITS = {
  buildings: 50,
  levelsPerBuilding: 120,
  unitsPerCell: 60,
  areas: 200,
  rooms: 30,
  multiLevelLinks: 500,
  maxNodes: 5000,
  extraLevelsPerUnit: 6,
  nameLength: 200,
} as const;

export type LevelKind = 'basement' | 'ground' | 'floor' | 'special' | 'roof';

export interface WizardLevel {
  /** Stable key inside the building (`bm1`, `g`, `f3`, `s1`, `r`). */
  readonly key: string;
  readonly kind: LevelKind;
  /** Basement depth (1 = -1) or floor number; unused for ground / special / roof. */
  readonly number?: number;
  /** Required name of a special level. */
  readonly label?: string;
  readonly units: Readonly<Partial<Record<UnitKind, number>>>;
}

export type BuildingStructure = 'building' | 'house';

export interface WizardBuilding {
  readonly name: string;
  /** `house`: a villa / private house - levels only, no "units" grouping in the cloud. */
  readonly structure: BuildingStructure;
  readonly levels: readonly WizardLevel[];
}

/** One unit also spanning other levels of its building. `ordinal` counts the units of `kind` on `levelKey`. */
export interface WizardMultiLevel {
  readonly buildingIndex: number;
  readonly levelKey: string;
  readonly kind: UnitKind;
  readonly ordinal: number;
  readonly extraLevelKeys: readonly string[];
}

export type WizardNumbering = 'sequential' | 'per_level';

export interface WizardSpec {
  readonly template: WizardTemplate;
  /** Optional compound / site root above several buildings. */
  readonly siteName: string | null;
  readonly buildings: readonly WizardBuilding[];
  /** Open-area / infrastructure sites: plain areas, no building, no levels. */
  readonly areas: readonly string[];
  readonly numbering: WizardNumbering;
  readonly multiLevel: readonly WizardMultiLevel[];
  /** Optional spaces added under every residential unit (suggested by the user, never automatic). */
  readonly rooms: readonly string[];
}

// ── levels ─────────────────────────────────────────────────────────────────────────────────────────

export function levelName(level: WizardLevel): string {
  switch (level.kind) {
    case 'basement':
      return `מרתף -${level.number ?? 1}`;
    case 'ground':
      return 'קומת קרקע';
    case 'floor':
      return `קומה ${level.number ?? 1}`;
    case 'roof':
      return 'גג';
    case 'special':
      return level.label?.trim() || 'מפלס מיוחד';
  }
}

export function levelLocationType(kind: LevelKind): LocationType {
  if (kind === 'basement') return 'basement';
  if (kind === 'roof') return 'roof';
  return 'floor';
}

/** Display order: deepest basement first, then ground, floors, special levels, roof last. */
export function orderLevels(levels: readonly WizardLevel[]): WizardLevel[] {
  const rank = (level: WizardLevel): number => {
    switch (level.kind) {
      case 'basement':
        return -1000; // basements sort among themselves below (deepest first)
      case 'ground':
        return 0;
      case 'floor':
        return level.number ?? 1;
      case 'special':
        return 10_000;
      case 'roof':
        return 20_000;
    }
  };
  return levels
    .map((level, index) => ({ level, index }))
    .sort((a, b) => {
      if (a.level.kind === 'basement' && b.level.kind === 'basement') {
        return (b.level.number ?? 1) - (a.level.number ?? 1);
      }
      return rank(a.level) - rank(b.level) || a.index - b.index;
    })
    .map((entry) => entry.level);
}

export interface LevelCounts {
  readonly basements: number;
  readonly ground: boolean;
  readonly floorsAboveGround: number;
  readonly roof: boolean;
  readonly special: readonly string[];
}

/** Builds the level list of a building from the simple counts shown in the wizard. */
export function makeLevels(
  counts: LevelCounts,
  unitsFor: (level: Pick<WizardLevel, 'key' | 'kind' | 'number'>) => WizardLevel['units'] = () => ({}),
): WizardLevel[] {
  const levels: WizardLevel[] = [];
  const add = (level: Omit<WizardLevel, 'units'>) => levels.push({ ...level, units: unitsFor(level) });
  for (let depth = counts.basements; depth >= 1; depth -= 1) add({ key: `bm${depth}`, kind: 'basement', number: depth });
  if (counts.ground) add({ key: 'g', kind: 'ground' });
  for (let n = 1; n <= counts.floorsAboveGround; n += 1) add({ key: `f${n}`, kind: 'floor', number: n });
  counts.special.forEach((label, index) => add({ key: `s${index + 1}`, kind: 'special', label }));
  if (counts.roof) add({ key: 'r', kind: 'roof' });
  return levels;
}

// ── templates (a starting point only, never a limit) ───────────────────────────────────────────────

export function buildingName(template: WizardTemplate, index: number, housePrefix = 'וילה'): string {
  const letter = String.fromCharCode(65 + (index % 26)) + (index >= 26 ? String(Math.floor(index / 26)) : '');
  if (template === 'house') return `${housePrefix} ${index + 1}`;
  return `בניין ${letter}`;
}

export function defaultBuilding(template: WizardTemplate, index: number, housePrefix = 'וילה'): WizardBuilding {
  const name = buildingName(template, index, housePrefix);
  switch (template) {
    case 'house':
      return {
        name,
        structure: 'house',
        levels: makeLevels({ basements: 0, ground: true, floorsAboveGround: 1, roof: false, special: [] }),
      };
    case 'commercial':
      return {
        name,
        structure: 'building',
        levels: makeLevels(
          { basements: 0, ground: true, floorsAboveGround: 3, roof: false, special: [] },
          (level) => (level.kind === 'ground' ? { shop: 2 } : { office: 2 }),
        ),
      };
    case 'mixed':
      return {
        name,
        structure: 'building',
        levels: makeLevels(
          { basements: 1, ground: true, floorsAboveGround: 4, roof: true, special: [] },
          (level) => (level.kind === 'ground' ? { shop: 2 } : level.kind === 'floor' ? { apartment: 4 } : {}),
        ),
      };
    case 'infrastructure':
      return { name, structure: 'building', levels: [] };
    case 'custom':
      return {
        name,
        structure: 'building',
        levels: makeLevels({ basements: 0, ground: true, floorsAboveGround: 0, roof: false, special: [] }),
      };
    case 'residential':
      return {
        name,
        structure: 'building',
        levels: makeLevels(
          { basements: 0, ground: true, floorsAboveGround: 4, roof: false, special: [] },
          (level) => (level.kind === 'floor' ? { apartment: 4 } : {}),
        ),
      };
  }
}

export function defaultAreas(count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => `אזור ${index + 1}`);
}

export function emptySpec(template: WizardTemplate): WizardSpec {
  return {
    template,
    siteName: null,
    buildings: template === 'infrastructure' ? [] : [defaultBuilding(template, 0)],
    areas: template === 'infrastructure' ? defaultAreas(3) : [],
    numbering: 'sequential',
    multiLevel: [],
    rooms: [],
  };
}

// ── rooms ──────────────────────────────────────────────────────────────────────────────────────────

export const ROOM_COUNTS = [2, 3, 4, 5, 6] as const;

export const OPTIONAL_ROOMS: readonly string[] = [
  'מטבח',
  'חדר רחצה',
  'מסדרון',
  'שירותי אורחים',
  'רחצת הורים',
  'מרפסת',
  'ממ"ד',
  'מחסן',
  'חדר כביסה',
];

/**
 * Suggested spaces of a residential unit. Rooms are counted the usual way (living room + bedrooms): a
 * 4-room flat is a living room and 3 bedrooms. These are suggestions - the user keeps, renames or drops any.
 */
export function roomTemplate(roomCount: number): { core: string[]; optional: string[] } {
  const rooms = Math.min(Math.max(Math.trunc(roomCount), 2), 6);
  const bedrooms = rooms - 1;
  const core = ['סלון'];
  for (let n = 1; n <= bedrooms; n += 1) core.push(bedrooms === 1 ? 'חדר שינה' : `חדר שינה ${n}`);
  return { core, optional: [...OPTIONAL_ROOMS] };
}

// ── numbering ──────────────────────────────────────────────────────────────────────────────────────

export function unitName(kind: UnitKind, number: number): string {
  return `${UNIT_KIND_LABELS[kind]} ${number}`;
}

function unitNameMatcher(kind: UnitKind): RegExp {
  const label = UNIT_KIND_LABELS[kind].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${label}\\s+(\\d+)$`);
}

/** The number in a unit name of this kind ("דירה 12" -> 12), or null when the name is custom. */
export function parseUnitNumber(kind: UnitKind, name: string): number | null {
  const match = unitNameMatcher(kind).exec(name.trim());
  return match ? Number(match[1]) : null;
}

/** Next number after the highest one used (archived units included), so no number is reused or shifted. */
export function nextUnitNumber(kind: UnitKind, existingNames: readonly string[]): number {
  let max = 0;
  for (const name of existingNames) {
    const number = parseUnitNumber(kind, name);
    if (number !== null && number > max) max = number;
  }
  return max + 1;
}

// ── the plan ───────────────────────────────────────────────────────────────────────────────────────

export type PlannedRole = 'site' | 'building' | 'level' | 'unit' | 'space' | 'area';

export interface PlannedNode {
  readonly key: string;
  readonly parentKey: string | null;
  readonly depth: number;
  readonly type: LocationType;
  readonly name: string;
  readonly sortOrder: number;
  readonly role: PlannedRole;
  readonly unitKind?: UnitKind;
  readonly structure?: BuildingStructure;
  /** Plan keys of the additional levels of a multi-level unit. */
  readonly extraLevelKeys?: readonly string[];
}

export type WizardIssue =
  | 'nothing_to_create'
  | 'buildings_range'
  | 'levels_range'
  | 'units_range'
  | 'areas_range'
  | 'rooms_range'
  | 'name_blank'
  | 'multi_level_invalid'
  | 'too_many_nodes';

function trimmed(value: string): string {
  return value.trim();
}

export function validateWizardSpec(spec: WizardSpec): WizardIssue[] {
  const issues = new Set<WizardIssue>();
  if (spec.buildings.length > WIZARD_LIMITS.buildings) issues.add('buildings_range');
  if (spec.areas.length > WIZARD_LIMITS.areas) issues.add('areas_range');
  if (spec.rooms.length > WIZARD_LIMITS.rooms) issues.add('rooms_range');
  if (spec.buildings.length === 0 && spec.areas.length === 0) issues.add('nothing_to_create');
  if (spec.siteName !== null && trimmed(spec.siteName).length === 0) issues.add('name_blank');
  for (const area of spec.areas) if (trimmed(area).length === 0 || area.length > WIZARD_LIMITS.nameLength) issues.add('name_blank');
  for (const room of spec.rooms) if (trimmed(room).length === 0 || room.length > WIZARD_LIMITS.nameLength) issues.add('name_blank');
  for (const building of spec.buildings) {
    if (trimmed(building.name).length === 0 || building.name.length > WIZARD_LIMITS.nameLength) issues.add('name_blank');
    if (building.levels.length > WIZARD_LIMITS.levelsPerBuilding) issues.add('levels_range');
    const keys = new Set<string>();
    for (const level of building.levels) {
      if (keys.has(level.key)) issues.add('levels_range');
      keys.add(level.key);
      if (level.kind === 'special' && trimmed(level.label ?? '').length === 0) issues.add('name_blank');
      for (const count of Object.values(level.units)) {
        if (count === undefined) continue;
        if (!Number.isInteger(count) || count < 0 || count > WIZARD_LIMITS.unitsPerCell) issues.add('units_range');
      }
    }
  }
  if (spec.multiLevel.length > WIZARD_LIMITS.multiLevelLinks) issues.add('multi_level_invalid');
  for (const link of spec.multiLevel) {
    const building = spec.buildings[link.buildingIndex];
    const primary = building?.levels.find((level) => level.key === link.levelKey);
    const count = primary?.units[link.kind] ?? 0;
    const validExtras =
      link.extraLevelKeys.length > 0 &&
      link.extraLevelKeys.length <= WIZARD_LIMITS.extraLevelsPerUnit &&
      new Set(link.extraLevelKeys).size === link.extraLevelKeys.length &&
      link.extraLevelKeys.every((key) => key !== link.levelKey && building?.levels.some((level) => level.key === key));
    if (!building || !primary || link.ordinal < 1 || link.ordinal > count || !validExtras) {
      issues.add('multi_level_invalid');
    }
  }
  if (issues.size === 0 && countPlannedNodes(spec) > WIZARD_LIMITS.maxNodes) issues.add('too_many_nodes');
  return [...issues];
}

/** Node count without building the plan (live preview and the size limit). */
export function countPlannedNodes(spec: WizardSpec): number {
  let total = spec.siteName ? 1 : 0;
  total += spec.areas.length;
  for (const building of spec.buildings) {
    total += 1 + building.levels.length;
    if (building.structure === 'house') continue;
    for (const level of building.levels) {
      for (const kind of UNIT_KINDS) {
        const count = level.units[kind] ?? 0;
        total += count;
        if (RESIDENTIAL_UNIT_KINDS.includes(kind)) total += count * spec.rooms.length;
      }
    }
  }
  return total;
}

/**
 * Deterministic plan: parents always before their children. Units are numbered per building and kind in
 * level order (sequential, the default) or per level (101, 102, 201, ... ground 1, 2, 3).
 */
export function planStructure(spec: WizardSpec): PlannedNode[] {
  const issues = validateWizardSpec(spec);
  if (issues.length > 0) throw new Error(`Invalid structure spec: ${issues.join(',')}`);

  const plan: PlannedNode[] = [];
  const root: { key: string | null; depth: number } = { key: null, depth: 0 };
  if (spec.siteName) {
    plan.push({ key: 'site', parentKey: null, depth: 0, type: 'site', name: trimmed(spec.siteName), sortOrder: 0, role: 'site' });
    root.key = 'site';
    root.depth = 1;
  }

  spec.areas.forEach((area, index) => {
    plan.push({
      key: `a${index}`,
      parentKey: root.key,
      depth: root.depth,
      type: 'zone',
      name: trimmed(area),
      sortOrder: index,
      role: 'area',
    });
  });

  spec.buildings.forEach((building, bi) => {
    const buildingKey = `b${bi}`;
    plan.push({
      key: buildingKey,
      parentKey: root.key,
      depth: root.depth,
      type: 'building',
      name: trimmed(building.name),
      sortOrder: bi,
      role: 'building',
      structure: building.structure,
    });

    const used = new Map<UnitKind, Set<number>>();
    const counters = new Map<UnitKind, number>();
    const claim = (kind: UnitKind, wanted: number): number => {
      const taken = used.get(kind) ?? new Set<number>();
      let candidate = wanted;
      while (taken.has(candidate)) candidate += 1;
      taken.add(candidate);
      used.set(kind, taken);
      return candidate;
    };

    const unitKeys = new Map<string, string>(); // `${levelKey}|${kind}|${ordinal}` -> unit key
    orderLevels(building.levels).forEach((level, levelIndex) => {
      const levelKey = `${buildingKey}/${level.key}`;
      plan.push({
        key: levelKey,
        parentKey: buildingKey,
        depth: root.depth + 1,
        type: levelLocationType(level.kind),
        name: levelName(level),
        sortOrder: levelIndex,
        role: 'level',
      });
      if (building.structure === 'house') return;

      let sort = 0;
      for (const kind of UNIT_KINDS) {
        const count = level.units[kind] ?? 0;
        for (let ordinal = 1; ordinal <= count; ordinal += 1) {
          const next = (counters.get(kind) ?? 0) + 1;
          counters.set(kind, next);
          const wanted =
            spec.numbering === 'per_level' && (level.kind === 'ground' || level.kind === 'floor')
              ? (level.kind === 'ground' ? 0 : (level.number ?? 1)) * 100 + ordinal
              : next;
          const number = claim(kind, wanted);
          const unitKey = `${levelKey}/${kind}${ordinal}`;
          unitKeys.set(`${level.key}|${kind}|${ordinal}`, unitKey);
          plan.push({
            key: unitKey,
            parentKey: levelKey,
            depth: root.depth + 2,
            type: unitLocationType(kind),
            name: unitName(kind, number),
            sortOrder: sort,
            role: 'unit',
            unitKind: kind,
          });
          sort += 1;
          if (RESIDENTIAL_UNIT_KINDS.includes(kind)) {
            spec.rooms.forEach((room, roomIndex) => {
              plan.push({
                key: `${unitKey}/r${roomIndex}`,
                parentKey: unitKey,
                depth: root.depth + 3,
                type: 'room',
                name: trimmed(room),
                sortOrder: roomIndex,
                role: 'space',
              });
            });
          }
        }
      }
    });

    for (const link of spec.multiLevel) {
      if (link.buildingIndex !== bi) continue;
      const unitKey = unitKeys.get(`${link.levelKey}|${link.kind}|${link.ordinal}`);
      const index = plan.findIndex((node) => node.key === unitKey);
      if (index < 0) throw new Error('Invalid structure spec: multi_level_invalid');
      plan[index] = { ...plan[index]!, extraLevelKeys: link.extraLevelKeys.map((key) => `${buildingKey}/${key}`) };
    }
  });

  return plan;
}

/** Plan grouped by depth (parents always before children) for level-by-level inserts. */
export function planDepthLevels(plan: readonly PlannedNode[]): PlannedNode[][] {
  const levels: PlannedNode[][] = [];
  for (const node of plan) (levels[node.depth] ??= []).push(node);
  return levels;
}

// ── summaries (preview and project overview) ───────────────────────────────────────────────────────

export interface PlanSummary {
  readonly buildings: number;
  readonly levels: number;
  /** Each unit once, however many levels it spans. */
  readonly units: number;
  readonly multiLevelUnits: number;
  readonly spaces: number;
  readonly areas: number;
  readonly byBuilding: readonly {
    readonly name: string;
    readonly levels: readonly { readonly name: string; readonly units: number }[];
  }[];
}

export function summarizePlan(plan: readonly PlannedNode[]): PlanSummary {
  const unitsByLevel = new Map<string, number>();
  for (const node of plan) {
    if (node.role === 'unit' && node.parentKey) unitsByLevel.set(node.parentKey, (unitsByLevel.get(node.parentKey) ?? 0) + 1);
  }
  const buildings = plan.filter((node) => node.role === 'building');
  return {
    buildings: buildings.length,
    levels: plan.filter((node) => node.role === 'level').length,
    units: plan.filter((node) => node.role === 'unit').length,
    multiLevelUnits: plan.filter((node) => node.role === 'unit' && (node.extraLevelKeys?.length ?? 0) > 0).length,
    spaces: plan.filter((node) => node.role === 'space').length,
    areas: plan.filter((node) => node.role === 'area').length,
    byBuilding: buildings.map((building) => ({
      name: building.name,
      levels: plan
        .filter((node) => node.role === 'level' && node.parentKey === building.key)
        .map((level) => ({ name: level.name, units: unitsByLevel.get(level.key) ?? 0 })),
    })),
  };
}
