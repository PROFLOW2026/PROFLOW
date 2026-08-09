/** Public API of the assets module (Wave 3). Maintenance ≠ Expense; inventory ≠ GL. */
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
  createInventoryItem,
  getInventoryItemById,
  listInventoryItemsForOrg,
  listMovementsForInventoryItem,
  recordInventoryMovement,
} from './application/inventory';
export type { InventoryItemWithReorder } from './application/inventory';

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
  InventoryMovementRecord,
} from './domain/types';

export {
  applyInventoryMovement,
  getReorderStatus,
  isInventoryQuantityGlOrExpense,
  isMaintenanceCostAnExpense,
  normalizeQuantity,
  REORDER_STATUSES,
} from './domain/inventory';
export type { ReorderStatus } from './domain/inventory';

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

export {
  createAssetSchema,
  updateAssetSchema,
  createFleetVehicleSchema,
  updateFleetVehicleSchema,
  createMaintenanceRecordSchema,
  updateMaintenanceRecordSchema,
  createInventoryItemSchema,
  recordInventoryMovementSchema,
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
} from './validation/schemas';
