/**
 * Optional construction characteristics of a project. Every field may be empty; the
 * recommendation engine treats an unknown value as "no signal", never as zero-with-meaning.
 * Areas are physical square metres (strings, exact decimals) - never money.
 */

export const CONSTRUCTION_CATEGORIES = [
  'residential',
  'commercial',
  'mixed_use',
  'office',
  'industrial',
  'public',
  'infrastructure',
  'renovation',
  'urban_renewal',
  'other',
] as const;
export type ConstructionCategory = (typeof CONSTRUCTION_CATEGORIES)[number];

export const CONSTRUCTION_METHODS = [
  'cast_in_place',
  'precast',
  'tunnel_formwork',
  'steel_structure',
  'timber',
  'light_construction',
  'mixed',
  'other',
] as const;
export type ConstructionMethod = (typeof CONSTRUCTION_METHODS)[number];

export const CHARACTERISTIC_COUNT_LIMITS = {
  buildingsCount: 500,
  floorsAboveGround: 200,
  floorsBelowGround: 30,
  residentialUnits: 100000,
  commercialUnits: 100000,
  parkingLevels: 30,
} as const;
export type CharacteristicCountField = keyof typeof CHARACTERISTIC_COUNT_LIMITS;
export const CHARACTERISTIC_COUNT_FIELDS = Object.keys(
  CHARACTERISTIC_COUNT_LIMITS,
) as CharacteristicCountField[];

export const CHARACTERISTIC_AREA_FIELDS = [
  'builtAreaSqm',
  'commercialAreaSqm',
  'commonAreaSqm',
  'siteAreaSqm',
] as const;
export type CharacteristicAreaField = (typeof CHARACTERISTIC_AREA_FIELDS)[number];

export interface ConstructionCharacteristics {
  readonly category: ConstructionCategory | null;
  readonly constructionMethod: ConstructionMethod | null;
  readonly buildingsCount: number | null;
  readonly floorsAboveGround: number | null;
  readonly floorsBelowGround: number | null;
  readonly residentialUnits: number | null;
  readonly commercialUnits: number | null;
  readonly parkingLevels: number | null;
  readonly hasPublicAreas: boolean;
  readonly builtAreaSqm: string | null;
  readonly commercialAreaSqm: string | null;
  readonly commonAreaSqm: string | null;
  readonly siteAreaSqm: string | null;
  readonly customMetadata: Readonly<Record<string, string>>;
}

export const EMPTY_CHARACTERISTICS: ConstructionCharacteristics = {
  category: null,
  constructionMethod: null,
  buildingsCount: null,
  floorsAboveGround: null,
  floorsBelowGround: null,
  residentialUnits: null,
  commercialUnits: null,
  parkingLevels: null,
  hasPublicAreas: false,
  builtAreaSqm: null,
  commercialAreaSqm: null,
  commonAreaSqm: null,
  siteAreaSqm: null,
  customMetadata: {},
};

export const CUSTOM_METADATA_MAX_ENTRIES = 30;

export function isConstructionCategory(value: unknown): value is ConstructionCategory {
  return typeof value === 'string' && (CONSTRUCTION_CATEGORIES as readonly string[]).includes(value);
}

export function isConstructionMethod(value: unknown): value is ConstructionMethod {
  return typeof value === 'string' && (CONSTRUCTION_METHODS as readonly string[]).includes(value);
}

/** True when nothing meaningful has been entered yet. */
export function isEmptyCharacteristics(value: ConstructionCharacteristics): boolean {
  return (
    value.category === null &&
    value.constructionMethod === null &&
    CHARACTERISTIC_COUNT_FIELDS.every((field) => value[field] === null) &&
    CHARACTERISTIC_AREA_FIELDS.every((field) => value[field] === null) &&
    !value.hasPublicAreas &&
    Object.keys(value.customMetadata).length === 0
  );
}

/** Units the recommendation and generator rules can count on (null = unknown). */
export function totalUnits(value: ConstructionCharacteristics): number | null {
  if (value.residentialUnits === null && value.commercialUnits === null) return null;
  return (value.residentialUnits ?? 0) + (value.commercialUnits ?? 0);
}

export function isResidentialCategory(category: ConstructionCategory | null): boolean {
  return category === 'residential' || category === 'mixed_use' || category === 'urban_renewal';
}

export function isNewBuildCategory(category: ConstructionCategory | null): boolean {
  return category !== 'renovation' && category !== 'infrastructure';
}

/** Normalizes key/value metadata: trimmed, non-empty, unique keys, bounded size. */
export function normalizeCustomMetadata(
  entries: readonly { readonly key: string; readonly value: string }[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of entries) {
    const key = entry.key.trim().slice(0, 80);
    const value = entry.value.trim().slice(0, 500);
    if (!key || !value) continue;
    if (Object.keys(result).length >= CUSTOM_METADATA_MAX_ENTRIES) break;
    result[key] = value;
  }
  return result;
}
