/** Public API of the assets module (Wave 3). Maintenance ≠ Expense; inventory ≠ GL; usage ≠ Actual. */
export { createAsset, getAssetById, listAssetsForOrg, updateAsset } from './application/assets';
export {
  createFleetVehicle,
  listFleetVehiclesForOrg,
  listLinkableVehicleAssets,
  updateFleetVehicle,
} from './application/fleet';
export {
  createMaintenanceRecord,
  listMaintenanceRecordsForAsset,
  listMaintenanceScheduleForOrg,
  updateMaintenanceRecord,
} from './application/maintenance';
export {
  archiveInventoryLocation,
  createInventoryItem,
  createInventoryLocation,
  ensureDefaultInventoryLocation,
  getInventoryItemById,
  listInventoryItemsForOrg,
  listInventoryLocationsForOrg,
  listMovementsForInventoryItem,
  recordInventoryMovement,
  updateInventoryLocation,
} from './application/inventory';
export type { InventoryItemWithReorder } from './application/inventory';
export {
  archiveEquipmentUsage,
  archiveMaterialUsage,
  listEquipmentUsageForAssetId,
  listEquipmentUsageForProjectId,
  listMaterialUsageForInventoryItemId,
  listMaterialUsageForProjectId,
  recordEquipmentUsage,
  recordMaterialUsage,
} from './application/usage';

export {
  ASSET_KINDS,
  ASSET_STATUSES,
  MAINTENANCE_STATUSES,
  INVENTORY_MOVEMENT_TYPES,
} from './domain/types';
export type {
  AssetKind,
  AssetStatus,
  MaintenanceStatus,
  InventoryMovementType,
  AssetRecord,
  FleetVehicleRecord,
  MaintenanceRecordRow,
  InventoryItemRecord,
  InventoryLocationBalanceRecord,
  InventoryLocationRecord,
  InventoryMovementRecord,
  MaterialUsageRecord,
  EquipmentUsageRecord,
} from './domain/types';

export {
  applyInventoryMovement,
  applySignedQuantityChange,
  defaultInventoryLocationName,
  getReorderStatus,
  isInventoryQuantityGlOrExpense,
  isMaintenanceCostAnExpense,
  isZeroQuantity,
  locationDeltasForMovement,
  normalizeQuantity,
  sumQuantities,
  DEFAULT_INVENTORY_LOCATION_CODE,
  DEFAULT_INVENTORY_LOCATION_NAME_EN,
  DEFAULT_INVENTORY_LOCATION_NAME_HE,
  REORDER_STATUSES,
} from './domain/inventory';
export type { ReorderStatus } from './domain/inventory';

export {
  assertUsageDateRange,
  doesUsageCreatePurchaseActual,
  hasEquipmentUsageMetric,
  isEquipmentUsageRecognizedActual,
  isMaterialUsageRecognizedActual,
} from './domain/usage';

export {
  allowedMaintenanceTransitions,
  assertMaintenanceStatusTransition,
  assetDocumentOwnerType,
  canTransitionMaintenanceStatus,
  classifyMaintenanceSchedule,
  isTerminalMaintenanceStatus,
  partitionMaintenanceBySchedule,
} from './domain/maintenance';
export type { MaintenanceScheduleBucket } from './domain/maintenance';

/** Cross-module read helpers (ops→finance bridges). Prefer application getters when available. */
export {
  findAssetById,
  findFleetById,
  findMaintenanceById,
} from './data/assets.repository';

export {
  createAssetSchema,
  updateAssetSchema,
  createFleetVehicleSchema,
  updateFleetVehicleSchema,
  createMaintenanceRecordSchema,
  updateMaintenanceRecordSchema,
  createInventoryItemSchema,
  recordInventoryMovementSchema,
  createInventoryLocationSchema,
  updateInventoryLocationSchema,
  archiveInventoryLocationSchema,
  recordMaterialUsageSchema,
  recordEquipmentUsageSchema,
  archiveMaterialUsageSchema,
  archiveEquipmentUsageSchema,
} from './validation/schemas';
export type {
  CreateAssetInput,
  UpdateAssetInput,
  CreateFleetVehicleInput,
  UpdateFleetVehicleInput,
  CreateMaintenanceRecordInput,
  UpdateMaintenanceRecordInput,
  CreateInventoryItemInput,
  RecordInventoryMovementInput,
  CreateInventoryLocationInput,
  UpdateInventoryLocationInput,
  ArchiveInventoryLocationInput,
  RecordMaterialUsageInput,
  RecordEquipmentUsageInput,
  ArchiveMaterialUsageInput,
  ArchiveEquipmentUsageInput,
} from './validation/schemas';
