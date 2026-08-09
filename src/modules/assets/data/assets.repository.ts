import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  assets,
  fleetVehicles,
  inventoryItems,
  inventoryMovements,
  maintenanceRecords,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  AssetKind,
  AssetRecord,
  AssetStatus,
  FleetVehicleRecord,
  InventoryItemRecord,
  InventoryMovementRecord,
  InventoryMovementType,
  MaintenanceRecordRow,
  MaintenanceStatus,
} from '../domain/types';

function asDateString(value: string | Date | null): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapAsset(row: typeof assets.$inferSelect): AssetRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    assetKind: row.assetKind as AssetKind,
    status: row.status as AssetStatus,
    identifier: row.identifier,
    manufacturer: row.manufacturer,
    model: row.model,
    serialNumber: row.serialNumber,
    assignedProjectId: row.assignedProjectId,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapFleet(row: typeof fleetVehicles.$inferSelect): FleetVehicleRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    assetId: row.assetId,
    plateNumber: row.plateNumber,
    vin: row.vin,
    odometer: row.odometer,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMaintenance(row: typeof maintenanceRecords.$inferSelect): MaintenanceRecordRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    assetId: row.assetId,
    title: row.title,
    status: row.status as MaintenanceStatus,
    performedOn: asDateString(row.performedOn),
    costAmount: row.costAmount,
    currency: row.currency,
    vendorId: row.vendorId,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapInventoryItem(row: typeof inventoryItems.$inferSelect): InventoryItemRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    materialItemId: row.materialItemId,
    name: row.name,
    sku: row.sku,
    unit: row.unit,
    quantityOnHand: row.quantityOnHand,
    reorderLevel: row.reorderLevel,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMovement(row: typeof inventoryMovements.$inferSelect): InventoryMovementRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    inventoryItemId: row.inventoryItemId,
    projectId: row.projectId,
    movementType: row.movementType as InventoryMovementType,
    quantity: row.quantity,
    occurredOn: asDateString(row.occurredOn) ?? row.occurredOn,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listAssets(
  db: DbExecutor,
  organizationId: string,
): Promise<AssetRecord[]> {
  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.organizationId, organizationId), isNull(assets.archivedAt)))
    .orderBy(assets.name);
  return rows.map(mapAsset);
}

export async function findAssetById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<AssetRecord | null> {
  const [row] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, id), eq(assets.organizationId, organizationId)))
    .limit(1);
  return row ? mapAsset(row) : null;
}

export async function insertAsset(
  db: DbExecutor,
  values: typeof assets.$inferInsert,
): Promise<AssetRecord> {
  const [row] = await db.insert(assets).values(values).returning();
  if (!row) throw new Error('Failed to insert asset');
  return mapAsset(row);
}

export async function findFleetByAssetId(
  db: DbExecutor,
  organizationId: string,
  assetId: string,
): Promise<FleetVehicleRecord | null> {
  const [row] = await db
    .select()
    .from(fleetVehicles)
    .where(
      and(
        eq(fleetVehicles.organizationId, organizationId),
        eq(fleetVehicles.assetId, assetId),
        isNull(fleetVehicles.archivedAt),
      ),
    )
    .limit(1);
  return row ? mapFleet(row) : null;
}

export async function insertFleetVehicle(
  db: DbExecutor,
  values: typeof fleetVehicles.$inferInsert,
): Promise<FleetVehicleRecord> {
  const [row] = await db.insert(fleetVehicles).values(values).returning();
  if (!row) throw new Error('Failed to insert fleet vehicle');
  return mapFleet(row);
}

export async function listMaintenanceForAsset(
  db: DbExecutor,
  organizationId: string,
  assetId: string,
): Promise<MaintenanceRecordRow[]> {
  const rows = await db
    .select()
    .from(maintenanceRecords)
    .where(
      and(
        eq(maintenanceRecords.organizationId, organizationId),
        eq(maintenanceRecords.assetId, assetId),
        isNull(maintenanceRecords.archivedAt),
      ),
    )
    .orderBy(desc(maintenanceRecords.createdAt));
  return rows.map(mapMaintenance);
}

export async function insertMaintenanceRecord(
  db: DbExecutor,
  values: typeof maintenanceRecords.$inferInsert,
): Promise<MaintenanceRecordRow> {
  const [row] = await db.insert(maintenanceRecords).values(values).returning();
  if (!row) throw new Error('Failed to insert maintenance record');
  return mapMaintenance(row);
}

export async function listInventoryItems(
  db: DbExecutor,
  organizationId: string,
): Promise<InventoryItemRecord[]> {
  const rows = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.organizationId, organizationId), isNull(inventoryItems.archivedAt)))
    .orderBy(inventoryItems.name);
  return rows.map(mapInventoryItem);
}

export async function findInventoryItemById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<InventoryItemRecord | null> {
  const [row] = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, id), eq(inventoryItems.organizationId, organizationId)))
    .limit(1);
  return row ? mapInventoryItem(row) : null;
}

export async function insertInventoryItem(
  db: DbExecutor,
  values: typeof inventoryItems.$inferInsert,
): Promise<InventoryItemRecord> {
  const [row] = await db.insert(inventoryItems).values(values).returning();
  if (!row) throw new Error('Failed to insert inventory item');
  return mapInventoryItem(row);
}

export async function updateInventoryQuantity(
  db: DbExecutor,
  organizationId: string,
  id: string,
  quantityOnHand: string,
): Promise<InventoryItemRecord | null> {
  const [row] = await db
    .update(inventoryItems)
    .set({ quantityOnHand, updatedAt: new Date() })
    .where(and(eq(inventoryItems.id, id), eq(inventoryItems.organizationId, organizationId)))
    .returning();
  return row ? mapInventoryItem(row) : null;
}

export async function insertInventoryMovement(
  db: DbExecutor,
  values: typeof inventoryMovements.$inferInsert,
): Promise<InventoryMovementRecord> {
  const [row] = await db.insert(inventoryMovements).values(values).returning();
  if (!row) throw new Error('Failed to insert inventory movement');
  return mapMovement(row);
}
