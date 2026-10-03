import type { ConstructionCategory, ConstructionMethod } from '../domain/characteristics';
import type { LocationGeneratorSpec } from '../domain/location-generator';
import type { LocationType } from '../domain/locations';
import type { OperatingRole, OwnershipModel } from '../domain/profile';

/** Serializable result of every structure server action. */
export type StructureActionResult =
  | { readonly ok: true; readonly count?: number }
  | { readonly ok: false; readonly error: string; readonly fieldErrors?: Record<string, string> };

export interface SaveProfilePayload {
  readonly projectId: string;
  readonly operatingRoles: OperatingRole[];
  readonly ownershipModel: OwnershipModel | null;
  readonly developerEntityName: string | null;
  readonly notes: string | null;
}

export interface SaveCharacteristicsPayload {
  readonly projectId: string;
  readonly category: ConstructionCategory | null;
  readonly constructionMethod: ConstructionMethod | null;
  readonly buildingsCount: string;
  readonly floorsAboveGround: string;
  readonly floorsBelowGround: string;
  readonly residentialUnits: string;
  readonly commercialUnits: string;
  readonly parkingLevels: string;
  readonly hasPublicAreas: boolean;
  readonly builtAreaSqm: string;
  readonly commercialAreaSqm: string;
  readonly commonAreaSqm: string;
  readonly siteAreaSqm: string;
  readonly customMetadata: { key: string; value: string }[];
}

export interface CreateLocationPayload {
  readonly projectId: string;
  readonly parentId: string | null;
  readonly type: LocationType;
  readonly name: string;
  readonly code: string | null;
}

export interface UpdateLocationPayload {
  readonly projectId: string;
  readonly locationId: string;
  readonly type?: LocationType;
  readonly name?: string;
  readonly code?: string | null;
  readonly isActive?: boolean;
}

export interface MoveLocationPayload {
  readonly projectId: string;
  readonly locationId: string;
  readonly parentId: string | null;
}

export interface LocationRefPayload {
  readonly projectId: string;
  readonly locationId: string;
}

export interface GenerateLocationsPayload {
  readonly projectId: string;
  readonly parentId: string | null;
  readonly spec: LocationGeneratorSpec;
}

export interface RecommendationKeysPayload {
  readonly projectId: string;
  readonly keys: string[];
}

export interface ProjectStructureActions {
  readonly saveProfile: (payload: SaveProfilePayload) => Promise<StructureActionResult>;
  readonly saveCharacteristics: (payload: SaveCharacteristicsPayload) => Promise<StructureActionResult>;
  readonly createLocation: (payload: CreateLocationPayload) => Promise<StructureActionResult>;
  readonly updateLocation: (payload: UpdateLocationPayload) => Promise<StructureActionResult>;
  readonly moveLocation: (payload: MoveLocationPayload) => Promise<StructureActionResult>;
  readonly archiveLocation: (payload: LocationRefPayload) => Promise<StructureActionResult>;
  readonly restoreLocation: (payload: LocationRefPayload) => Promise<StructureActionResult>;
  readonly generateLocations: (payload: GenerateLocationsPayload) => Promise<StructureActionResult>;
  readonly acceptRecommendations: (payload: RecommendationKeysPayload) => Promise<StructureActionResult>;
  readonly dismissRecommendations: (payload: RecommendationKeysPayload) => Promise<StructureActionResult>;
  readonly restoreRecommendations: (payload: RecommendationKeysPayload) => Promise<StructureActionResult>;
}
