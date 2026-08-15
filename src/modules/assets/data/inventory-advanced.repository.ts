import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  inventoryCountLines,
  inventoryCounts,
  inventoryItems,
  inventoryMovements,
  inventoryReservations,
} from '@drizzle/schema';
import { ORG_LIST_HARD_CAP, resolveListLimit } from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import { normalizeQuantity } from '../domain/inventory';
import type {
  InventoryCountLineRecord,
  InventoryCountRecord,
  InventoryCountStatus,
  InventoryReservationRecord,
  InventoryReservationStatus,
} from '../domain/types';

function asDateString(value: string | Date | null): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapReservation(
  row: typeof inventoryReservations.$inferSelect,
): InventoryReservationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    inventoryItemId: row.inventoryItemId,
    projectId: row.projectId,
    workOrderId: row.workOrderId,
    quantity: row.quantity,
    status: row.status as InventoryReservationStatus,
    notes: row.notes,
    createdByUserId: row.createdByUserId,
    releasedAt: row.releasedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCount(row: typeof inventoryCounts.$inferSelect): InventoryCountRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    locationId: row.locationId,
    status: row.status as InventoryCountStatus,
    countedOn: asDateString(row.countedOn) ?? row.countedOn,
    notes: row.notes,
    finalizedAt: row.finalizedAt,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCountLine(row: typeof inventoryCountLines.$inferSelect): InventoryCountLineRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    countId: row.countId,
    inventoryItemId: row.inventoryItemId,
    expectedQuantity: row.expectedQuantity,
    countedQuantity: row.countedQuantity,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function lockInventoryItemRow(
  db: DbExecutor,
  organizationId: string,
  inventoryItemId: string,
): Promise<void> {
  await db
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(
      and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.organizationId, organizationId)),
    )
    .for('update')
    .limit(1);
}

export async function lockInventoryReservationForUpdate(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<InventoryReservationRecord | null> {
  const [row] = await db
    .select()
    .from(inventoryReservations)
    .where(
      and(eq(inventoryReservations.id, id), eq(inventoryReservations.organizationId, organizationId)),
    )
    .for('update')
    .limit(1);
  return row ? mapReservation(row) : null;
}

export async function lockInventoryCountForUpdate(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<InventoryCountRecord | null> {
  const [row] = await db
    .select()
    .from(inventoryCounts)
    .where(and(eq(inventoryCounts.id, id), eq(inventoryCounts.organizationId, organizationId)))
    .for('update')
    .limit(1);
  return row ? mapCount(row) : null;
}

export async function claimDraftInventoryCount(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<InventoryCountRecord | null> {
  const [row] = await db
    .update(inventoryCounts)
    .set({ status: 'finalizing', updatedAt: new Date() })
    .where(
      and(
        eq(inventoryCounts.id, id),
        eq(inventoryCounts.organizationId, organizationId),
        eq(inventoryCounts.status, 'draft'),
      ),
    )
    .returning();
  return row ? mapCount(row) : null;
}

export async function listAdjustMovementIdsForCount(
  db: DbExecutor,
  organizationId: string,
  countId: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: inventoryMovements.id })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.organizationId, organizationId),
        eq(inventoryMovements.movementType, 'adjust'),
        eq(inventoryMovements.notes, `Stock count ${countId}`),
      ),
    )
    .orderBy(inventoryMovements.createdAt);
  return rows.map((row) => row.id);
}

export async function sumActiveReservedForItem(
  db: DbExecutor,
  organizationId: string,
  inventoryItemId: string,
): Promise<string> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${inventoryReservations.quantity}), 0)::text`,
    })
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.organizationId, organizationId),
        eq(inventoryReservations.inventoryItemId, inventoryItemId),
        eq(inventoryReservations.status, 'active'),
      ),
    );
  return normalizeQuantity(row?.total ?? '0');
}

export async function sumActiveReservedByItemIds(
  db: DbExecutor,
  organizationId: string,
  inventoryItemIds: readonly string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (inventoryItemIds.length === 0) return result;
  const rows = await db
    .select({
      inventoryItemId: inventoryReservations.inventoryItemId,
      total: sql<string>`coalesce(sum(${inventoryReservations.quantity}), 0)::text`,
    })
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.organizationId, organizationId),
        eq(inventoryReservations.status, 'active'),
        inArray(inventoryReservations.inventoryItemId, [...inventoryItemIds]),
      ),
    )
    .groupBy(inventoryReservations.inventoryItemId);
  for (const row of rows) {
    result.set(row.inventoryItemId, normalizeQuantity(row.total ?? '0'));
  }
  return result;
}

export async function listInventoryReservations(
  db: DbExecutor,
  organizationId: string,
  options: {
    readonly inventoryItemId?: string;
    readonly status?: InventoryReservationStatus;
    readonly limit?: number;
  } = {},
): Promise<InventoryReservationRecord[]> {
  const rows = await db
    .select()
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.organizationId, organizationId),
        options.inventoryItemId
          ? eq(inventoryReservations.inventoryItemId, options.inventoryItemId)
          : undefined,
        options.status ? eq(inventoryReservations.status, options.status) : undefined,
      ),
    )
    .orderBy(desc(inventoryReservations.createdAt))
    .limit(resolveListLimit(options.limit, { hardCap: ORG_LIST_HARD_CAP }));
  return rows.map(mapReservation);
}

export async function findInventoryReservationById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<InventoryReservationRecord | null> {
  const [row] = await db
    .select()
    .from(inventoryReservations)
    .where(
      and(eq(inventoryReservations.id, id), eq(inventoryReservations.organizationId, organizationId)),
    )
    .limit(1);
  return row ? mapReservation(row) : null;
}

export async function insertInventoryReservation(
  db: DbExecutor,
  values: typeof inventoryReservations.$inferInsert,
): Promise<InventoryReservationRecord> {
  const [row] = await db.insert(inventoryReservations).values(values).returning();
  if (!row) throw new Error('Failed to insert inventory reservation');
  return mapReservation(row);
}

export async function updateInventoryReservationById(
  db: DbExecutor,
  organizationId: string,
  id: string,
  patch: Partial<{
    quantity: string;
    status: InventoryReservationStatus;
    notes: string | null;
    releasedAt: Date | null;
  }>,
  options?: {
    readonly fromStatuses?: readonly InventoryReservationStatus[];
    readonly expectedQuantity?: string;
  },
): Promise<InventoryReservationRecord | null> {
  const conditions = [
    eq(inventoryReservations.id, id),
    eq(inventoryReservations.organizationId, organizationId),
  ];
  if (options?.fromStatuses && options.fromStatuses.length > 0) {
    conditions.push(inArray(inventoryReservations.status, [...options.fromStatuses]));
  }
  if (options?.expectedQuantity !== undefined) {
    conditions.push(eq(inventoryReservations.quantity, options.expectedQuantity));
  }

  const [row] = await db
    .update(inventoryReservations)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(...conditions))
    .returning();
  return row ? mapReservation(row) : null;
}

export async function listInventoryCounts(
  db: DbExecutor,
  organizationId: string,
  options: { readonly limit?: number } = {},
): Promise<InventoryCountRecord[]> {
  const rows = await db
    .select()
    .from(inventoryCounts)
    .where(eq(inventoryCounts.organizationId, organizationId))
    .orderBy(desc(inventoryCounts.countedOn), desc(inventoryCounts.createdAt))
    .limit(resolveListLimit(options.limit, { hardCap: ORG_LIST_HARD_CAP }));
  return rows.map(mapCount);
}

export async function findInventoryCountById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<InventoryCountRecord | null> {
  const [row] = await db
    .select()
    .from(inventoryCounts)
    .where(and(eq(inventoryCounts.id, id), eq(inventoryCounts.organizationId, organizationId)))
    .limit(1);
  return row ? mapCount(row) : null;
}

export async function insertInventoryCount(
  db: DbExecutor,
  values: typeof inventoryCounts.$inferInsert,
): Promise<InventoryCountRecord> {
  const [row] = await db.insert(inventoryCounts).values(values).returning();
  if (!row) throw new Error('Failed to insert inventory count');
  return mapCount(row);
}

export async function updateInventoryCountById(
  db: DbExecutor,
  organizationId: string,
  id: string,
  patch: Partial<{
    status: InventoryCountStatus;
    notes: string | null;
    finalizedAt: Date | null;
  }>,
): Promise<InventoryCountRecord | null> {
  const [row] = await db
    .update(inventoryCounts)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(inventoryCounts.id, id), eq(inventoryCounts.organizationId, organizationId)))
    .returning();
  return row ? mapCount(row) : null;
}

export async function updateInventoryCountIfStatus(
  db: DbExecutor,
  organizationId: string,
  id: string,
  expectedStatus: InventoryCountStatus,
  patch: Partial<{
    status: InventoryCountStatus;
    notes: string | null;
    finalizedAt: Date | null;
  }>,
): Promise<InventoryCountRecord | null> {
  const [row] = await db
    .update(inventoryCounts)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(inventoryCounts.id, id),
        eq(inventoryCounts.organizationId, organizationId),
        eq(inventoryCounts.status, expectedStatus),
      ),
    )
    .returning();
  return row ? mapCount(row) : null;
}

export async function listInventoryCountLines(
  db: DbExecutor,
  organizationId: string,
  countId: string,
): Promise<InventoryCountLineRecord[]> {
  const rows = await db
    .select()
    .from(inventoryCountLines)
    .where(
      and(
        eq(inventoryCountLines.organizationId, organizationId),
        eq(inventoryCountLines.countId, countId),
      ),
    )
    .orderBy(inventoryCountLines.createdAt);
  return rows.map(mapCountLine);
}

export async function findInventoryCountLine(
  db: DbExecutor,
  organizationId: string,
  countId: string,
  inventoryItemId: string,
): Promise<InventoryCountLineRecord | null> {
  const [row] = await db
    .select()
    .from(inventoryCountLines)
    .where(
      and(
        eq(inventoryCountLines.organizationId, organizationId),
        eq(inventoryCountLines.countId, countId),
        eq(inventoryCountLines.inventoryItemId, inventoryItemId),
      ),
    )
    .limit(1);
  return row ? mapCountLine(row) : null;
}

export async function insertInventoryCountLine(
  db: DbExecutor,
  values: typeof inventoryCountLines.$inferInsert,
): Promise<InventoryCountLineRecord> {
  const [row] = await db.insert(inventoryCountLines).values(values).returning();
  if (!row) throw new Error('Failed to insert inventory count line');
  return mapCountLine(row);
}

export async function updateInventoryCountLineById(
  db: DbExecutor,
  organizationId: string,
  id: string,
  patch: Partial<{ expectedQuantity: string; countedQuantity: string }>,
): Promise<InventoryCountLineRecord | null> {
  const [row] = await db
    .update(inventoryCountLines)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(inventoryCountLines.id, id), eq(inventoryCountLines.organizationId, organizationId)),
    )
    .returning();
  return row ? mapCountLine(row) : null;
}
