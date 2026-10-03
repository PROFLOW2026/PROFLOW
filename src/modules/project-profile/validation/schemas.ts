import { z } from 'zod';
import {
  CHARACTERISTIC_COUNT_LIMITS,
  CONSTRUCTION_CATEGORIES,
  CONSTRUCTION_METHODS,
  CUSTOM_METADATA_MAX_ENTRIES,
} from '../domain/characteristics';
import { GENERATOR_LIMITS } from '../domain/location-generator';
import { LOCATION_TYPES } from '../domain/locations';
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

const recommendationKey = z.string().regex(/^[a-z][a-z_]*:[a-z0-9_:]+$/).max(120);

export const recommendationKeysSchema = z.object({
  projectId: projectIdSchema,
  keys: z.array(recommendationKey).min(1).max(200),
});
export type RecommendationKeysInput = z.input<typeof recommendationKeysSchema>;
