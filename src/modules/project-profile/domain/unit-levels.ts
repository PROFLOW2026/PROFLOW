/**
 * Unit <-> level links (pure). A unit has ONE row and ONE parent (its primary level); the additional
 * levels live in `metadata.extraLevelIds`, so a multi-level unit is stored, counted and filed once.
 */
import { WIZARD_LIMITS, nextUnitNumber, type UnitKind } from './structure-wizard';
import { buildLocationIndex, locationPath, type LocationIndex, type LocationNode, type LocationType } from './locations';

export const LEVEL_TYPES: readonly LocationType[] = ['floor', 'basement', 'roof', 'parking'];
export const UNIT_TYPES: readonly LocationType[] = ['apartment', 'unit'];

export function isLevelType(type: LocationType): boolean {
  return LEVEL_TYPES.includes(type);
}

export function isUnitType(type: LocationType): boolean {
  return UNIT_TYPES.includes(type);
}

export interface LocationMeta {
  readonly extraLevelIds: readonly string[];
  readonly levelId: string | null;
  readonly structure: 'house' | 'building' | null;
  readonly unitKind: string | null;
}

const EMPTY_META: LocationMeta = { extraLevelIds: [], levelId: null, structure: null, unitKind: null };

/** Tolerant reader for `project_locations.metadata` (older rows have none of these keys). */
export function readLocationMeta(metadata: unknown): LocationMeta {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return EMPTY_META;
  const record = metadata as Record<string, unknown>;
  const extras = Array.isArray(record.extraLevelIds)
    ? record.extraLevelIds.filter((value): value is string => typeof value === 'string')
    : [];
  return {
    extraLevelIds: extras,
    levelId: typeof record.levelId === 'string' ? record.levelId : null,
    structure: record.structure === 'house' || record.structure === 'building' ? record.structure : null,
    unitKind: typeof record.unitKind === 'string' ? record.unitKind : null,
  };
}

/** Nearest building (or house) above a location, else the nearest site, else null. */
export function buildingOf(index: LocationIndex, id: string): string | null {
  const path = locationPath(index, id);
  for (let i = path.length - 1; i >= 0; i -= 1) if (path[i]!.type === 'building') return path[i]!.id;
  return null;
}

/**
 * First free number for a new unit of `kind` under `parentId`: one more than the highest number used by any
 * unit (archived included) of the same building. Existing units are never renumbered.
 */
export function suggestUnitNumber(
  nodes: readonly LocationNode[],
  parentId: string | null,
  kind: UnitKind,
): number {
  const index = buildLocationIndex(nodes);
  const building = parentId ? buildingOf(index, parentId) : null;
  const names = nodes
    .filter((node) => isUnitType(node.type) && (node.parentId ? buildingOf(index, node.parentId) : null) === building)
    .map((node) => node.name);
  return nextUnitNumber(kind, names);
}

/** All levels a unit occupies: its primary level (the parent) first, then the extra levels still alive. */
export function unitLevels(index: LocationIndex, unit: LocationNode): LocationNode[] {
  const levels: LocationNode[] = [];
  const parent = unit.parentId ? index.byId.get(unit.parentId) : undefined;
  if (parent && isLevelType(parent.type)) levels.push(parent);
  for (const id of unit.extraLevelIds ?? []) {
    const level = index.byId.get(id);
    if (level && isLevelType(level.type) && !levels.some((existing) => existing.id === level.id)) levels.push(level);
  }
  return levels;
}

export type LevelLinkError =
  | 'not_found'
  | 'not_a_unit'
  | 'not_a_level'
  | 'same_as_primary'
  | 'other_building'
  | 'archived'
  | 'too_many'
  | 'duplicate';

/** Validates the additional levels of a unit: live levels of the same building, never the primary one. */
export function validateExtraLevels(
  index: LocationIndex,
  unitId: string,
  extraLevelIds: readonly string[],
): LevelLinkError | null {
  const unit = index.byId.get(unitId);
  if (!unit) return 'not_found';
  if (!isUnitType(unit.type)) return 'not_a_unit';
  if (extraLevelIds.length > WIZARD_LIMITS.extraLevelsPerUnit) return 'too_many';
  if (new Set(extraLevelIds).size !== extraLevelIds.length) return 'duplicate';
  const building = buildingOf(index, unitId);
  for (const id of extraLevelIds) {
    const level = index.byId.get(id);
    if (!level) return 'not_found';
    if (!isLevelType(level.type)) return 'not_a_level';
    if (level.archived) return 'archived';
    if (id === unit.parentId) return 'same_as_primary';
    if (buildingOf(index, id) !== building) return 'other_building';
  }
  return null;
}

/** A space may be tagged with one level of its building (e.g. a room on the upper floor of a duplex). */
export function validateSpaceLevel(index: LocationIndex, spaceId: string, levelId: string | null): LevelLinkError | null {
  const space = index.byId.get(spaceId);
  if (!space) return 'not_found';
  if (levelId === null) return null;
  const level = index.byId.get(levelId);
  if (!level) return 'not_found';
  if (!isLevelType(level.type)) return 'not_a_level';
  if (level.archived) return 'archived';
  return buildingOf(index, spaceId) === buildingOf(index, levelId) ? null : 'other_building';
}

/**
 * Locations whose documentation belongs to `levelId`: the level itself, everything below it (units whose
 * primary level it is, their spaces) and the multi-level units that also occupy it, with their spaces.
 * Used by the gallery filter, so no physical level folder is needed to filter by level.
 */
export function levelScopeIds(index: LocationIndex, levelId: string): string[] {
  const result = new Set<string>();
  /** Adds a subtree; a space tagged with another level stays out (it belongs to that level). */
  const add = (id: string, root: boolean) => {
    const stack = [id];
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (result.has(next)) continue;
      const node = index.byId.get(next);
      if (!root || next !== id) {
        if (node?.levelId && node.levelId !== levelId) continue;
      }
      result.add(next);
      for (const child of index.childrenOf.get(next) ?? []) stack.push(child.id);
    }
  };
  add(levelId, true);
  // Multi-level units that also occupy this level: the unit itself plus the spaces tagged with it.
  for (const node of index.byId.values()) {
    if (!node.extraLevelIds?.includes(levelId)) continue;
    result.add(node.id);
    const stack = [...(index.childrenOf.get(node.id) ?? [])];
    while (stack.length > 0) {
      const child = stack.pop()!;
      if (child.levelId === levelId && !result.has(child.id)) {
        result.add(child.id);
        stack.push(...(index.childrenOf.get(child.id) ?? []));
      }
    }
  }
  // Spaces tagged with this level wherever they sit.
  for (const node of index.byId.values()) if (node.levelId === levelId) result.add(node.id);
  return [...result];
}
