/** Public API of the project-profile module (Developer / GC Track D). UI lives in `./ui`. */
export {
  OPERATING_ROLES,
  OWNERSHIP_MODELS,
  STANDARD_PROFILE,
  buildDeliveryProfile,
  clientRequirement,
  hasRole,
  isOperatingRole,
  isStandardProfile,
  normalizeOperatingRoles,
  resolveOwnershipModel,
  usesExecutionLayer,
  type ClientRequirement,
  type DeliveryProfile,
  type OperatingRole,
  type OwnershipModel,
} from './domain/profile';
export {
  MANAGEMENT_MODES,
  isDeveloperGcMode,
  isManagementMode,
  operatingRolesForMode,
  resolveManagementMode,
  type ManagementMode,
} from './domain/management-mode';
export {
  CONSTRUCTION_CATEGORIES,
  CONSTRUCTION_METHODS,
  EMPTY_CHARACTERISTICS,
  isEmptyCharacteristics,
  totalUnits,
  type ConstructionCategory,
  type ConstructionCharacteristics,
  type ConstructionMethod,
} from './domain/characteristics';
export {
  DEFAULT_LOCATION_SEPARATOR,
  LOCATION_TYPES,
  buildLocationIndex,
  collectSubtreeIds,
  filterLocationEntries,
  flattenLocationTree,
  formatLocationCodePath,
  formatLocationLabel,
  isLocationType,
  locationPath,
  type FlatLocationEntry,
  type LocationIndex,
  type LocationNode,
  type LocationType,
} from './domain/locations';
export {
  GENERATOR_LIMITS,
  countGeneratedNodes,
  planLocationTree,
  validateGeneratorSpec,
  type LocationGeneratorLabels,
  type LocationGeneratorSpec,
} from './domain/location-generator';
export {
  RECOMMENDATION_KINDS,
  RECOMMENDATION_TARGET_BY_KIND,
  RULESET_VERSION,
  applyDecisions,
  groupByKind,
  recommend,
  type Recommendation,
  type RecommendationKind,
  type RecommendationTarget,
  type RecommendationWithStatus,
  type ReasonCode,
} from './domain/recommendations';

export { loadStructurePermissions, type StructurePermissions } from './application/authorize';
export {
  getConstructionCharacteristics,
  getDeliveryProfile,
  updateConstructionCharacteristics,
  updateDeliveryProfile,
} from './application/profile';
export {
  MAX_LOCATIONS_PER_PROJECT,
  archiveProjectLocation,
  createProjectLocation,
  generateProjectLocations,
  listLocationOptions,
  listLocationTree,
  moveProjectLocation,
  resolveLocationLabels,
  restoreProjectLocation,
  updateProjectLocationDetails,
  type GenerateLocationsResult,
} from './application/locations';
export {
  acceptRecommendations,
  dismissRecommendations,
  listProjectRecommendations,
  restoreRecommendations,
  type AcceptRecommendationsResult,
  type ProjectRecommendationState,
  type RecommendationTitleResolver,
} from './application/recommendations';
export { findProjectDeliveryProfile } from './application/read-delivery-profile';
export { getProjectStructure, type ProjectStructureView } from './application/structure';
export {
  DELIVERY_CREATE_FIELD,
  parseDeliveryCreateFormData,
  type DeliveryCreateInput,
} from './domain/create-section';
export { applyDeliveryAtProjectCreate, applyManagementModeAtCreate, canSetDeliveryProfileAtCreate } from './application/create-section';
