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
  listLowStockItems,
  listMovementsForInventoryItem,
  recordInventoryMovement,
  updateInventoryLocation,
} from './application/inventory';
export type { InventoryItemWithReorder } from './application/inventory';
export {
  listInventoryReservationsForOrg,
  releaseInventoryReservation,
  reserveInventory,
} from './application/inventory-reservations';
export {
  createInventoryCount,
  finalizeInventoryCount,
  getInventoryCountDetail,
  listInventoryCountsForOrg,
  upsertInventoryCountLine,
  voidInventoryCount,
} from './application/inventory-counts';
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
  INVENTORY_LOCATION_KINDS,
  INVENTORY_RESERVATION_STATUSES,
  INVENTORY_COUNT_STATUSES,
} from './domain/types';
export type {
  AssetKind,
  AssetStatus,
  MaintenanceStatus,
  InventoryMovementType,
  InventoryLocationKind,
  InventoryReservationStatus,
  InventoryCountStatus,
  AssetRecord,
  FleetVehicleRecord,
  MaintenanceRecordRow,
  InventoryItemRecord,
  InventoryLocationBalanceRecord,
  InventoryLocationRecord,
  InventoryMovementRecord,
  InventoryReservationRecord,
  InventoryCountRecord,
  InventoryCountLineRecord,
  LowStockItem,
  MaterialUsageRecord,
  EquipmentUsageRecord,
} from './domain/types';

export {
  applyInventoryMovement,
  applySignedQuantityChange,
  assertCanReserve,
  availableQuantity,
  countLineAdjustQuantity,
  defaultInventoryLocationName,
  getReorderStatus,
  isInventoryCountRecognizedActual,
  isInventoryQuantityGlOrExpense,
  isLowStock,
  isMaintenanceCostAnExpense,
  isZeroQuantity,
  locationDeltasForMovement,
  normalizeQuantity,
  remainingReservationAfterConsume,
  resolveMinStockLevel,
  suggestedReorder,
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
  reserveInventorySchema,
  releaseInventoryReservationSchema,
  createInventoryCountSchema,
  upsertInventoryCountLineSchema,
  finalizeInventoryCountSchema,
  voidInventoryCountSchema,
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
  ReserveInventoryInput,
  ReleaseInventoryReservationInput,
  CreateInventoryCountInput,
  UpsertInventoryCountLineInput,
  FinalizeInventoryCountInput,
  VoidInventoryCountInput,
  RecordMaterialUsageInput,
  RecordEquipmentUsageInput,
  ArchiveMaterialUsageInput,
  ArchiveEquipmentUsageInput,
} from './validation/schemas';
