/**
 * Assets / fleet / maintenance / inventory domain types (Wave 3).
 * Maintenance cost_amount is metadata — not an Expense posting.
 * Inventory quantity is not GL and not Expense.
 */

export const ASSET_KINDS = ['equipment', 'vehicle', 'tool', 'other'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_STATUSES = ['active', 'in_maintenance', 'retired', 'disposed'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const MAINTENANCE_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const INVENTORY_MOVEMENT_TYPES = ['receive', 'issue', 'adjust', 'return'] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export interface AssetRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly assetKind: AssetKind;
  readonly status: AssetStatus;
  readonly identifier: string | null;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly serialNumber: string | null;
  readonly assignedProjectId: string | null;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface FleetVehicleRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly assetId: string;
  readonly plateNumber: string | null;
  readonly vin: string | null;
  readonly odometer: string | null;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MaintenanceRecordRow {
  readonly id: string;
  readonly organizationId: string;
  readonly assetId: string;
  readonly title: string;
  readonly status: MaintenanceStatus;
  readonly performedOn: string | null;
  /** Operational metadata only — never posts an Expense. */
  readonly costAmount: string | null;
  readonly currency: string | null;
  readonly vendorId: string | null;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InventoryItemRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly materialItemId: string | null;
  readonly name: string;
  readonly sku: string | null;
  readonly unit: string;
  /** Quantity on hand — not a GL balance. */
  readonly quantityOnHand: string;
  readonly reorderLevel: string | null;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InventoryMovementRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly inventoryItemId: string;
  readonly projectId: string | null;
  readonly movementType: InventoryMovementType;
  readonly quantity: string;
  readonly occurredOn: string;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Operational material consumption — not Actual cost. */
export interface MaterialUsageRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly materialId: string | null;
  readonly inventoryItemId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unit: string | null;
  readonly usageDate: string;
  readonly employeeId: string | null;
  readonly notes: string | null;
  readonly createdByUserId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Equipment / vehicle usage — assignment itself does not create Actual. */
export interface EquipmentUsageRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly assetId: string;
  readonly usageDate: string;
  readonly endDate: string | null;
  readonly hours: string | null;
  readonly days: string | null;
  readonly mileage: string | null;
  readonly employeeId: string | null;
  readonly notes: string | null;
  readonly createdByUserId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
