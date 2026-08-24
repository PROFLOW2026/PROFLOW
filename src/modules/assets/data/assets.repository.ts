import { and, desc, eq, ilike, isNull, notInArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  assets,
  fleetVehicles,
  inventoryItems,
  inventoryLocations,
  inventoryLocationBalances,
  inventoryMovements,
  maintenanceRecords,
  projects,
} from '@drizzle/schema';
import {
  ORG_LIST_EXPORT_CAP,
  ORG_LIST_HARD_CAP,
  resolveListLimit,
  resolveListOffset,
} from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import type {
  AssetKind,
  AssetRecord,
  AssetStatus,
  FleetVehicleRecord,
  InventoryItemRecord,
  InventoryLocationBalanceRecord,
  InventoryLocationKind,
  InventoryLocationRecord,
  InventoryMovementRecord,
  InventoryMovementType,
  MaintenanceRecordRow,
  MaintenanceStatus,
} from '../domain/types';
import { normalizeQuantity } from '../domain/inventory';

export interface AssetListItem extends AssetRecord {
  readonly assignedProjectName: string | null;
}

export interface FleetVehicleListItem extends FleetVehicleRecord {
  readonly assetName: string;
  readonly assetStatus: AssetStatus;
  readonly assignedProjectId: string | null;
  readonly assignedProjectName: string | null;
}

export interface MaintenanceListItem extends MaintenanceRecordRow {
  readonly assetName: string;
}

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
    acquisitionAmount: row.acquisitionAmount ?? null,
    acquisitionCurrency: row.acquisitionCurrency ?? null,
    acquiredOn: asDateString(row.acquiredOn),
    sourceExpenseId: row.sourceExpenseId ?? null,
    sourceApBillId: row.sourceApBillId ?? null,
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
    barcode: row.barcode ?? null,
    unit: row.unit,
    quantityOnHand: row.quantityOnHand,
    costBasisAmount: row.costBasisAmount ?? '0',
    costBasisCurrency: row.costBasisCurrency ?? null,
    reorderLevel: row.reorderLevel,
    minStockLevel: row.minStockLevel ?? null,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMovement(
  row: typeof inventoryMovements.$inferSelect,
  names: { fromLocationName?: string | null; toLocationName?: string | null } = {},
): InventoryMovementRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    inventoryItemId: row.inventoryItemId,
    projectId: row.projectId,
    movementType: row.movementType as InventoryMovementType,
    quantity: row.quantity,
    occurredOn: asDateString(row.occurredOn) ?? row.occurredOn,
    fromLocationId: row.fromLocationId ?? null,
    toLocationId: row.toLocationId ?? null,
    fromLocationName: names.fromLocationName ?? null,
    toLocationName: names.toLocationName ?? null,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapLocation(row: typeof inventoryLocations.$inferSelect): InventoryLocationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    code: row.code,
    locationKind: (row.locationKind ?? 'warehouse') as InventoryLocationKind,
    projectId: row.projectId ?? null,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listAssets(
  db: DbExecutor,
  organizationId: string,
  options: { readonly limit?: number; readonly offset?: number } = {},
): Promise<AssetListItem[]> {
  const rows = await db
    .select({
      asset: assets,
      assignedProjectName: projects.name,
    })
    .from(assets)
    .leftJoin(projects, eq(assets.assignedProjectId, projects.id))
    .where(and(eq(assets.organizationId, organizationId), isNull(assets.archivedAt)))
    .orderBy(assets.name)
    .limit(
      resolveListLimit(options.limit, {
        hardCap:
          options.limit != null && options.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(options.offset));
  return rows.map((row) => ({
    ...mapAsset(row.asset),
    assignedProjectName: row.assignedProjectName ?? null,
  }));
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

export async function updateAssetById(
  db: DbExecutor,
  organizationId: string,
  id: string,
  patch: Partial<{
    name: string;
    assetKind: AssetKind;
    status: AssetStatus;
    identifier: string | null;
    manufacturer: string | null;
    model: string | null;
    serialNumber: string | null;
    assignedProjectId: string | null;
    acquisitionAmount: string | null;
    acquisitionCurrency: string | null;
    acquiredOn: string | null;
    sourceExpenseId: string | null;
    sourceApBillId: string | null;
    notes: string | null;
  }>,
): Promise<AssetRecord | null> {
  const [row] = await db
    .update(assets)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(assets.id, id), eq(assets.organizationId, organizationId)))
    .returning();
  return row ? mapAsset(row) : null;
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

export async function findFleetById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<FleetVehicleRecord | null> {
  const [row] = await db
    .select()
    .from(fleetVehicles)
    .where(and(eq(fleetVehicles.id, id), eq(fleetVehicles.organizationId, organizationId)))
    .limit(1);
  return row ? mapFleet(row) : null;
}

export async function listFleetVehicles(
  db: DbExecutor,
  organizationId: string,
  options: { readonly limit?: number; readonly offset?: number } = {},
): Promise<FleetVehicleListItem[]> {
  const rows = await db
    .select({
      fleet: fleetVehicles,
      assetName: assets.name,
      assetStatus: assets.status,
      assignedProjectId: assets.assignedProjectId,
      assignedProjectName: projects.name,
    })
    .from(fleetVehicles)
    .innerJoin(assets, eq(fleetVehicles.assetId, assets.id))
    .leftJoin(projects, eq(assets.assignedProjectId, projects.id))
    .where(
      and(
        eq(fleetVehicles.organizationId, organizationId),
        isNull(fleetVehicles.archivedAt),
        isNull(assets.archivedAt),
      ),
    )
    .orderBy(assets.name)
    .limit(
      resolveListLimit(options.limit, {
        hardCap:
          options.limit != null && options.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(options.offset));

  return rows.map((row) => ({
    ...mapFleet(row.fleet),
    assetName: row.assetName,
    assetStatus: row.assetStatus as AssetStatus,
    assignedProjectId: row.assignedProjectId,
    assignedProjectName: row.assignedProjectName ?? null,
  }));
}

export async function listVehicleAssetsWithoutFleet(
  db: DbExecutor,
  organizationId: string,
): Promise<AssetRecord[]> {
  const linked = await db
    .select({ assetId: fleetVehicles.assetId })
    .from(fleetVehicles)
    .where(
      and(eq(fleetVehicles.organizationId, organizationId), isNull(fleetVehicles.archivedAt)),
    );
  const linkedIds = linked.map((row) => row.assetId);

  const rows = await db
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.organizationId, organizationId),
        isNull(assets.archivedAt),
        eq(assets.assetKind, 'vehicle'),
        linkedIds.length > 0 ? notInArray(assets.id, linkedIds) : sql`true`,
      ),
    )
    .orderBy(assets.name);
  return rows.map(mapAsset);
}

export async function insertFleetVehicle(
  db: DbExecutor,
  values: typeof fleetVehicles.$inferInsert,
): Promise<FleetVehicleRecord> {
  const [row] = await db.insert(fleetVehicles).values(values).returning();
  if (!row) throw new Error('Failed to insert fleet vehicle');
  return mapFleet(row);
}

export async function updateFleetVehicleById(
  db: DbExecutor,
  organizationId: string,
  id: string,
  patch: Partial<{
    plateNumber: string | null;
    vin: string | null;
    odometer: string | null;
    notes: string | null;
  }>,
): Promise<FleetVehicleRecord | null> {
  const [row] = await db
    .update(fleetVehicles)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(fleetVehicles.id, id), eq(fleetVehicles.organizationId, organizationId)))
    .returning();
  return row ? mapFleet(row) : null;
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

export async function listMaintenanceForOrg(
  db: DbExecutor,
  organizationId: string,
  options: { readonly limit?: number; readonly offset?: number } = {},
): Promise<MaintenanceListItem[]> {
  const rows = await db
    .select({
      record: maintenanceRecords,
      assetName: assets.name,
    })
    .from(maintenanceRecords)
    .innerJoin(assets, eq(maintenanceRecords.assetId, assets.id))
    .where(
      and(
        eq(maintenanceRecords.organizationId, organizationId),
        isNull(maintenanceRecords.archivedAt),
        isNull(assets.archivedAt),
      ),
    )
    .orderBy(desc(maintenanceRecords.performedOn), desc(maintenanceRecords.createdAt))
    .limit(
      resolveListLimit(options.limit, {
        hardCap:
          options.limit != null && options.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(options.offset));

  return rows.map((row) => ({
    ...mapMaintenance(row.record),
    assetName: row.assetName,
  }));
}

export async function findMaintenanceById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<MaintenanceRecordRow | null> {
  const [row] = await db
    .select()
    .from(maintenanceRecords)
    .where(
      and(eq(maintenanceRecords.id, id), eq(maintenanceRecords.organizationId, organizationId)),
    )
    .limit(1);
  return row ? mapMaintenance(row) : null;
}

export async function insertMaintenanceRecord(
  db: DbExecutor,
  values: typeof maintenanceRecords.$inferInsert,
): Promise<MaintenanceRecordRow> {
  const [row] = await db.insert(maintenanceRecords).values(values).returning();
  if (!row) throw new Error('Failed to insert maintenance record');
  return mapMaintenance(row);
}

export async function updateMaintenanceRecordById(
  db: DbExecutor,
  organizationId: string,
  id: string,
  patch: Partial<{
    title: string;
    status: MaintenanceStatus;
    performedOn: string | null;
    costAmount: string | null;
    currency: string | null;
    vendorId: string | null;
    notes: string | null;
  }>,
): Promise<MaintenanceRecordRow | null> {
  const [row] = await db
    .update(maintenanceRecords)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(maintenanceRecords.id, id), eq(maintenanceRecords.organizationId, organizationId)),
    )
    .returning();
  return row ? mapMaintenance(row) : null;
}

export async function listInventoryItems(
  db: DbExecutor,
  organizationId: string,
  options: { readonly limit?: number; readonly offset?: number; readonly search?: string } = {},
): Promise<InventoryItemRecord[]> {
  const term = options.search?.trim();
  const searchFilter =
    term && term.length > 0
      ? or(
          ilike(inventoryItems.name, `%${term}%`),
          ilike(inventoryItems.sku, `%${term}%`),
          ilike(inventoryItems.barcode, `%${term}%`),
        )
      : undefined;
  const rows = await db
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.organizationId, organizationId),
        isNull(inventoryItems.archivedAt),
        searchFilter,
      ),
    )
    .orderBy(inventoryItems.name)
    .limit(
      resolveListLimit(options.limit, {
        hardCap:
          options.limit != null && options.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(options.offset));
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

export async function listInventoryMovementsForItem(
  db: DbExecutor,
  organizationId: string,
  inventoryItemId: string,
): Promise<InventoryMovementRecord[]> {
  const fromLoc = alias(inventoryLocations, 'inventory_from_location');
  const toLoc = alias(inventoryLocations, 'inventory_to_location');
  const rows = await db
    .select({
      movement: inventoryMovements,
      fromLocationName: fromLoc.name,
      toLocationName: toLoc.name,
    })
    .from(inventoryMovements)
    .leftJoin(fromLoc, eq(fromLoc.id, inventoryMovements.fromLocationId))
    .leftJoin(toLoc, eq(toLoc.id, inventoryMovements.toLocationId))
    .where(
      and(
        eq(inventoryMovements.organizationId, organizationId),
        eq(inventoryMovements.inventoryItemId, inventoryItemId),
      ),
    )
    .orderBy(desc(inventoryMovements.occurredOn), desc(inventoryMovements.createdAt));
  return rows.map((row) =>
    mapMovement(row.movement, {
      fromLocationName: row.fromLocationName,
      toLocationName: row.toLocationName,
    }),
  );
}

export interface InventoryMovementWithItem extends InventoryMovementRecord {
  readonly itemName: string;
  readonly itemSku: string | null;
}

/** Recent org movements with item labels — one query, no per-item N+1. */
export async function listRecentInventoryMovementsForOrg(
  db: DbExecutor,
  organizationId: string,
  options: { readonly limit?: number } = {},
): Promise<InventoryMovementWithItem[]> {
  const fromLoc = alias(inventoryLocations, 'recent_from_location');
  const toLoc = alias(inventoryLocations, 'recent_to_location');
  const rows = await db
    .select({
      movement: inventoryMovements,
      itemName: inventoryItems.name,
      itemSku: inventoryItems.sku,
      fromLocationName: fromLoc.name,
      toLocationName: toLoc.name,
    })
    .from(inventoryMovements)
    .innerJoin(
      inventoryItems,
      and(
        eq(inventoryItems.id, inventoryMovements.inventoryItemId),
        eq(inventoryItems.organizationId, organizationId),
        isNull(inventoryItems.archivedAt),
      ),
    )
    .leftJoin(fromLoc, eq(fromLoc.id, inventoryMovements.fromLocationId))
    .leftJoin(toLoc, eq(toLoc.id, inventoryMovements.toLocationId))
    .where(eq(inventoryMovements.organizationId, organizationId))
    .orderBy(desc(inventoryMovements.occurredOn), desc(inventoryMovements.createdAt))
    .limit(
      resolveListLimit(options.limit ?? 40, {
        hardCap: ORG_LIST_HARD_CAP,
      }),
    );

  return rows.map((row) => ({
    ...mapMovement(row.movement, {
      fromLocationName: row.fromLocationName,
      toLocationName: row.toLocationName,
    }),
    itemName: row.itemName,
    itemSku: row.itemSku,
  }));
}

export async function listInventoryLocations(
  db: DbExecutor,
  organizationId: string,
  options: { readonly includeArchived?: boolean } = {},
): Promise<InventoryLocationRecord[]> {
  const rows = await db
    .select()
    .from(inventoryLocations)
    .where(
      and(
        eq(inventoryLocations.organizationId, organizationId),
        options.includeArchived ? undefined : isNull(inventoryLocations.archivedAt),
      ),
    )
    .orderBy(inventoryLocations.name);
  return rows.map(mapLocation);
}

export async function findInventoryLocationById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<InventoryLocationRecord | null> {
  const [row] = await db
    .select()
    .from(inventoryLocations)
    .where(and(eq(inventoryLocations.id, id), eq(inventoryLocations.organizationId, organizationId)))
    .limit(1);
  return row ? mapLocation(row) : null;
}

export async function findInventoryLocationByName(
  db: DbExecutor,
  organizationId: string,
  name: string,
): Promise<InventoryLocationRecord | null> {
  const [row] = await db
    .select()
    .from(inventoryLocations)
    .where(
      and(
        eq(inventoryLocations.organizationId, organizationId),
        eq(inventoryLocations.name, name),
        isNull(inventoryLocations.archivedAt),
      ),
    )
    .limit(1);
  return row ? mapLocation(row) : null;
}

export async function insertInventoryLocation(
  db: DbExecutor,
  values: typeof inventoryLocations.$inferInsert,
): Promise<InventoryLocationRecord> {
  const [row] = await db.insert(inventoryLocations).values(values).returning();
  if (!row) throw new Error('Failed to insert inventory location');
  return mapLocation(row);
}

export async function updateInventoryLocationById(
  db: DbExecutor,
  organizationId: string,
  id: string,
  patch: Partial<{
    name: string;
    code: string | null;
    locationKind: InventoryLocationKind;
    projectId: string | null;
    archivedAt: Date | null;
  }>,
): Promise<InventoryLocationRecord | null> {
  const [row] = await db
    .update(inventoryLocations)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(inventoryLocations.id, id), eq(inventoryLocations.organizationId, organizationId)))
    .returning();
  return row ? mapLocation(row) : null;
}

export async function listLocationBalancesForItem(
  db: DbExecutor,
  organizationId: string,
  inventoryItemId: string,
): Promise<InventoryLocationBalanceRecord[]> {
  const rows = await db
    .select({
      balance: inventoryLocationBalances,
      locationName: inventoryLocations.name,
      locationCode: inventoryLocations.code,
    })
    .from(inventoryLocationBalances)
    .innerJoin(inventoryLocations, eq(inventoryLocations.id, inventoryLocationBalances.locationId))
    .where(
      and(
        eq(inventoryLocationBalances.organizationId, organizationId),
        eq(inventoryLocationBalances.inventoryItemId, inventoryItemId),
      ),
    )
    .orderBy(inventoryLocations.name);
  return rows.map((row) => ({
    id: row.balance.id,
    organizationId: row.balance.organizationId,
    inventoryItemId: row.balance.inventoryItemId,
    locationId: row.balance.locationId,
    locationName: row.locationName,
    locationCode: row.locationCode,
    quantity: row.balance.quantity,
    createdAt: row.balance.createdAt,
    updatedAt: row.balance.updatedAt,
  }));
}

export async function findLocationBalance(
  db: DbExecutor,
  organizationId: string,
  inventoryItemId: string,
  locationId: string,
): Promise<{ id: string; quantity: string } | null> {
  const [row] = await db
    .select({
      id: inventoryLocationBalances.id,
      quantity: inventoryLocationBalances.quantity,
    })
    .from(inventoryLocationBalances)
    .where(
      and(
        eq(inventoryLocationBalances.organizationId, organizationId),
        eq(inventoryLocationBalances.inventoryItemId, inventoryItemId),
        eq(inventoryLocationBalances.locationId, locationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertLocationBalanceQuantity(
  db: DbExecutor,
  values: {
    readonly organizationId: string;
    readonly inventoryItemId: string;
    readonly locationId: string;
    readonly quantity: string;
  },
): Promise<void> {
  const existing = await findLocationBalance(
    db,
    values.organizationId,
    values.inventoryItemId,
    values.locationId,
  );
  if (existing) {
    await db
      .update(inventoryLocationBalances)
      .set({ quantity: values.quantity, updatedAt: new Date() })
      .where(
        and(
          eq(inventoryLocationBalances.id, existing.id),
          eq(inventoryLocationBalances.organizationId, values.organizationId),
        ),
      );
    return;
  }
  await db.insert(inventoryLocationBalances).values({
    organizationId: values.organizationId,
    inventoryItemId: values.inventoryItemId,
    locationId: values.locationId,
    quantity: values.quantity,
  });
}

export async function sumLocationBalancesForItem(
  db: DbExecutor,
  organizationId: string,
  inventoryItemId: string,
): Promise<string> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${inventoryLocationBalances.quantity}), 0)::text`,
    })
    .from(inventoryLocationBalances)
    .where(
      and(
        eq(inventoryLocationBalances.organizationId, organizationId),
        eq(inventoryLocationBalances.inventoryItemId, inventoryItemId),
      ),
    );
  return normalizeQuantity(row?.total ?? '0');
}

export async function countNonZeroBalancesForLocation(
  db: DbExecutor,
  organizationId: string,
  locationId: string,
): Promise<number> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(inventoryLocationBalances)
    .where(
      and(
        eq(inventoryLocationBalances.organizationId, organizationId),
        eq(inventoryLocationBalances.locationId, locationId),
        sql`${inventoryLocationBalances.quantity} <> 0`,
      ),
    );
  return row?.count ?? 0;
}

export async function listLocationBalancesForLocation(
  db: DbExecutor,
  organizationId: string,
  locationId: string,
): Promise<InventoryLocationBalanceRecord[]> {
  const rows = await db
    .select({
      balance: inventoryLocationBalances,
      locationName: inventoryLocations.name,
      locationCode: inventoryLocations.code,
    })
    .from(inventoryLocationBalances)
    .innerJoin(inventoryLocations, eq(inventoryLocations.id, inventoryLocationBalances.locationId))
    .where(
      and(
        eq(inventoryLocationBalances.organizationId, organizationId),
        eq(inventoryLocationBalances.locationId, locationId),
      ),
    )
    .orderBy(inventoryLocations.name);
  return rows.map((row) => ({
    id: row.balance.id,
    organizationId: row.balance.organizationId,
    inventoryItemId: row.balance.inventoryItemId,
    locationId: row.balance.locationId,
    locationName: row.locationName,
    locationCode: row.locationCode,
    quantity: row.balance.quantity,
    createdAt: row.balance.createdAt,
    updatedAt: row.balance.updatedAt,
  }));
}
