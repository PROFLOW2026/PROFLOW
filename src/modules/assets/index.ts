/** Public API of the assets module (Wave 3). Maintenance ≠ Expense; inventory ≠ GL. */
export { createAsset, getAssetById, listAssetsForOrg } from './application/assets';
export {
  createMaintenanceRecord,
  listMaintenanceRecordsForAsset,
} from './application/maintenance';
export {
  createInventoryItem,
  listInventoryItemsForOrg,
  recordInventoryMovement,
} from './application/inventory';

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
  isInventoryQuantityGlOrExpense,
  isMaintenanceCostAnExpense,
  normalizeQuantity,
} from './domain/inventory';

export {
  createAssetSchema,
  createMaintenanceRecordSchema,
  createInventoryItemSchema,
  recordInventoryMovementSchema,
} from './validation/schemas';
export type {
  CreateAssetInput,
  CreateMaintenanceRecordInput,
  CreateInventoryItemInput,
  RecordInventoryMovementInput,
} from './validation/schemas';
