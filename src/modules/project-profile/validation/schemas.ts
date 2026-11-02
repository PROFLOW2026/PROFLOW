import { z } from 'zod';
import {
  CHARACTERISTIC_COUNT_LIMITS,
  CONSTRUCTION_CATEGORIES,
  CONSTRUCTION_METHODS,
  CUSTOM_METADATA_MAX_ENTRIES,
} from '../domain/characteristics';
import { GENERATOR_LIMITS } from '../domain/location-generator';
import { LOCATION_TYPES } from '../domain/locations';
import { UNIT_KINDS, WIZARD_LIMITS, WIZARD_TEMPLATES } from '../domain/structure-wizard';
import { OPERATING_ROLES, OWNERSHIP_MODELS } from '../domain/profile';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return typeof value === 'string' ? value.trim() || null : value;
};

const optionalText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable());

const optionalCount = (max: number) =>
  z.preprocess(
    (value) => {
      const cleaned = emptyToNull(value);
      if (cleaned === null) return null;
      return typeof cleaned === 'string' ? Number(cleaned) : cleaned;
    },
    z.number().int().min(0).max(max).nullable(),
  );

const optionalArea = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{1,12}(\.\d{1,2})?$/)
    .nullable(),
);

export const projectIdSchema = z.string().uuid();

export const updateDeliveryProfileSchema = z.object({
  projectId: projectIdSchema,
  operatingRoles: z.array(z.enum(OPERATING_ROLES)).max(OPERATING_ROLES.length),
  ownershipModel: z.enum(OWNERSHIP_MODELS).nullable().optional(),
  developerEntityName: optionalText(200).optional(),
  notes: optionalText(2000).optional(),
});
export type UpdateDeliveryProfileInput = z.input<typeof updateDeliveryProfileSchema>;

export const updateCharacteristicsSchema = z.object({
  projectId: projectIdSchema,
  category: z.preprocess(emptyToNull, z.enum(CONSTRUCTION_CATEGORIES).nullable()),
  constructionMethod: z.preprocess(emptyToNull, z.enum(CONSTRUCTION_METHODS).nullable()),
  buildingsCount: optionalCount(CHARACTERISTIC_COUNT_LIMITS.buildingsCount),
  floorsAboveGround: optionalCount(CHARACTERISTIC_COUNT_LIMITS.floorsAboveGround),
  floorsBelowGround: optionalCount(CHARACTERISTIC_COUNT_LIMITS.floorsBelowGround),
  residentialUnits: optionalCount(CHARACTERISTIC_COUNT_LIMITS.residentialUnits),
  commercialUnits: optionalCount(CHARACTERISTIC_COUNT_LIMITS.commercialUnits),
  parkingLevels: optionalCount(CHARACTERISTIC_COUNT_LIMITS.parkingLevels),
  hasPublicAreas: z.boolean().default(false),
  builtAreaSqm: optionalArea,
  commercialAreaSqm: optionalArea,
  commonAreaSqm: optionalArea,
  siteAreaSqm: optionalArea,
  customMetadata: z
    .array(z.object({ key: z.string().max(80), value: z.string().max(500) }))
    .max(CUSTOM_METADATA_MAX_ENTRIES)
    .default([]),
});
export type UpdateCharacteristicsInput = z.input<typeof updateCharacteristicsSchema>;

const locationCode = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .max(40)
    .regex(/^[\p{L}\p{N}._\-/ ]+$/u)
    .nullable(),
);

export const createLocationSchema = z.object({
  projectId: projectIdSchema,
  parentId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
  type: z.enum(LOCATION_TYPES),
  name: z.string().trim().min(1).max(200),
  code: locationCode,
});
export type CreateLocationInput = z.input<typeof createLocationSchema>;

export const updateLocationSchema = z.object({
  projectId: projectIdSchema,
  locationId: z.string().uuid(),
  type: z.enum(LOCATION_TYPES).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  code: locationCode.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});
export type UpdateLocationInput = z.input<typeof updateLocationSchema>;

export const moveLocationSchema = z.object({
  projectId: projectIdSchema,
  locationId: z.string().uuid(),
  parentId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
});
export type MoveLocationInput = z.input<typeof moveLocationSchema>;

export const locationRefSchema = z.object({
  projectId: projectIdSchema,
  locationId: z.string().uuid(),
});

const intRange = (min: number, max: number) =>
  z.preprocess((value) => (typeof value === 'string' ? Number(value) : value), z.number().int().min(min).max(max));

export const generateLocationsSchema = z.object({
  projectId: projectIdSchema,
  parentId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
  spec: z.object({
    buildings: intRange(1, GENERATOR_LIMITS.buildings),
    buildingCodeStyle: z.enum(['letters', 'numbers']),
    floorsAboveGround: intRange(0, GENERATOR_LIMITS.floorsAboveGround),
    floorsBelowGround: intRange(0, GENERATOR_LIMITS.floorsBelowGround),
    includeGroundFloor: z.boolean(),
    unitsPerFloor: intRange(0, GENERATOR_LIMITS.unitsPerFloor),
    unitType: z.enum(['apartment', 'unit']),
    unitsOnGroundFloor: z.boolean(),
    unitNumbering: z.enum(['per_building', 'per_floor']),
    undergroundAsParking: z.boolean(),
    includeRoof: z.boolean(),
  }),
});
export type GenerateLocationsInput = z.input<typeof generateLocationsSchema>;

const wizardName = z.string().trim().min(1).max(WIZARD_LIMITS.nameLength);

const wizardLevelSchema = z.object({
  key: z.string().min(1).max(20),
  kind: z.enum(['basement', 'ground', 'floor', 'special', 'roof']),
  number: z.number().int().min(0).max(200).optional(),
  label: z.string().trim().max(WIZARD_LIMITS.nameLength).optional(),
  units: z.partialRecord(z.enum(UNIT_KINDS), z.number().int().min(0).max(WIZARD_LIMITS.unitsPerCell)),
});

export const createStructureSchema = z.object({
  projectId: projectIdSchema,
  parentId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
  spec: z.object({
    template: z.enum(WIZARD_TEMPLATES),
    siteName: z.preprocess(emptyToNull, wizardName.nullable()),
    buildings: z
      .array(
        z.object({
          name: wizardName,
          structure: z.enum(['building', 'house']),
          levels: z.array(wizardLevelSchema).max(WIZARD_LIMITS.levelsPerBuilding),
        }),
      )
      .max(WIZARD_LIMITS.buildings),
    areas: z.array(wizardName).max(WIZARD_LIMITS.areas),
    numbering: z.enum(['sequential', 'per_level']),
    multiLevel: z
      .array(
        z.object({
          buildingIndex: z.number().int().min(0).max(WIZARD_LIMITS.buildings),
          levelKey: z.string().min(1).max(20),
          kind: z.enum(UNIT_KINDS),
          ordinal: z.number().int().min(1).max(WIZARD_LIMITS.unitsPerCell),
          extraLevelKeys: z.array(z.string().min(1).max(20)).max(WIZARD_LIMITS.extraLevelsPerUnit),
        }),
      )
      .max(WIZARD_LIMITS.multiLevelLinks),
    rooms: z.array(wizardName).max(WIZARD_LIMITS.rooms),
  }),
});
export type CreateStructureInput = z.input<typeof createStructureSchema>;

export const addUnitsSchema = z.object({
  projectId: projectIdSchema,
  /** The primary level (or a building / area when there are no levels). */
  parentId: z.string().uuid(),
  kind: z.enum(UNIT_KINDS),
  count: intRange(1, WIZARD_LIMITS.unitsPerCell),
  /** Optional explicit first number; omitted = the next free number of the building. */
  startNumber: z.preprocess(emptyToNull, z.number().int().min(1).max(99999).nullable()).optional(),
  rooms: z.array(wizardName).max(WIZARD_LIMITS.rooms).optional(),
});
export type AddUnitsInput = z.input<typeof addUnitsSchema>;

export const setUnitLevelsSchema = z.object({
  projectId: projectIdSchema,
  unitId: z.string().uuid(),
  extraLevelIds: z.array(z.string().uuid()).max(WIZARD_LIMITS.extraLevelsPerUnit),
});
export type SetUnitLevelsInput = z.input<typeof setUnitLevelsSchema>;

export const setSpaceLevelSchema = z.object({
  projectId: projectIdSchema,
  spaceId: z.string().uuid(),
  levelId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
});
export type SetSpaceLevelInput = z.input<typeof setSpaceLevelSchema>;

export const setUnitKindSchema = z.object({
  projectId: projectIdSchema,
  unitId: z.string().uuid(),
  kind: z.enum(UNIT_KINDS),
});
export type SetUnitKindInput = z.input<typeof setUnitKindSchema>;

const recommendationKey = z.string().regex(/^[a-z][a-z_]*:[a-z0-9_:]+$/).max(120);

export const recommendationKeysSchema = z.object({
  projectId: projectIdSchema,
  keys: z.array(recommendationKey).min(1).max(200),
});
export type RecommendationKeysInput = z.input<typeof recommendationKeysSchema>;
