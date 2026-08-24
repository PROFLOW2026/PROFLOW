/**
 * Inventory managerial cost layers / consumptions persistence.
 * Stock remaining value is NOT operating Actual / General Pool.
 */

import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import {
  inventoryCostConsumptions,
  inventoryCostLayers,
  inventoryItems,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import { money, type MoneyValue } from '@/shared/money';
import { normalizeQuantity } from '../domain/inventory';
import type { InventoryCostLayerSlice } from '../domain/inventory-cost';

export type InventoryCostConsumptionKind = 'project_consume' | 'writeoff' | 'adjust';

export interface InventoryCostLayerRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly inventoryItemId: string;
  readonly sourceKind: string;
  readonly sourceExpenseId: string | null;
  readonly sourceApBillId: string | null;
  readonly openingReference: string | null;
  readonly receivedOn: string;
  readonly receivedQty: string;
  readonly remainingQty: string;
  readonly unitCost: string;
  readonly currency: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InventoryCostConsumptionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly inventoryItemId: string;
  readonly inventoryCostLayerId: string;
  readonly projectId: string | null;
  readonly movementId: string | null;
  readonly materialUsageId: string | null;
  readonly quantity: string;
  readonly amount: string;
  readonly currency: string;
  readonly kind: InventoryCostConsumptionKind;
  readonly occurredOn: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function asDateString(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapLayer(row: typeof inventoryCostLayers.$inferSelect): InventoryCostLayerRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    inventoryItemId: row.inventoryItemId,
    sourceKind: row.sourceKind,
    sourceExpenseId: row.sourceExpenseId ?? null,
    sourceApBillId: row.sourceApBillId ?? null,
    openingReference: row.openingReference ?? null,
    receivedOn: asDateString(row.receivedOn),
    receivedQty: row.receivedQty,
    remainingQty: row.remainingQty,
    unitCost: row.unitCost,
    currency: row.currency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapConsumption(
  row: typeof inventoryCostConsumptions.$inferSelect,
): InventoryCostConsumptionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    inventoryItemId: row.inventoryItemId,
    inventoryCostLayerId: row.inventoryCostLayerId,
    projectId: row.projectId ?? null,
    movementId: row.movementId ?? null,
    materialUsageId: row.materialUsageId ?? null,
    quantity: row.quantity,
    amount: row.amount,
    currency: row.currency,
    kind: row.kind as InventoryCostConsumptionKind,
    occurredOn: asDateString(row.occurredOn),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function layerToSlice(layer: InventoryCostLayerRecord): InventoryCostLayerSlice {
  return {
    id: layer.id,
    remainingQty: layer.remainingQty,
    unitCost: money(layer.unitCost, layer.currency),
  };
}

/** Lock item row for cost-basis mutation (same pattern as qty movements). */
export async function lockInventoryItemForCost(
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

export async function findLayerBySourceExpenseId(
  db: DbExecutor,
  organizationId: string,
  sourceExpenseId: string,
): Promise<InventoryCostLayerRecord | null> {
  const [row] = await db
    .select()
    .from(inventoryCostLayers)
    .where(
      and(
        eq(inventoryCostLayers.organizationId, organizationId),
        eq(inventoryCostLayers.sourceExpenseId, sourceExpenseId),
      ),
    )
    .limit(1);
  return row ? mapLayer(row) : null;
}

/** Open layers in FIFO receive order (remaining_qty > 0). Locked for update. */
export async function listOpenLayersFifoForUpdate(
  db: DbExecutor,
  organizationId: string,
  inventoryItemId: string,
): Promise<InventoryCostLayerRecord[]> {
  return asServiceRoleWrite(db, async () => {
    const rows = await db
      .select()
      .from(inventoryCostLayers)
      .where(
        and(
          eq(inventoryCostLayers.organizationId, organizationId),
          eq(inventoryCostLayers.inventoryItemId, inventoryItemId),
          gt(inventoryCostLayers.remainingQty, '0'),
        ),
      )
      .orderBy(asc(inventoryCostLayers.receivedOn), asc(inventoryCostLayers.createdAt))
      .for('update');
    return rows.map(mapLayer);
  });
}

export async function findLayerByOpeningReference(
  db: DbExecutor,
  organizationId: string,
  inventoryItemId: string,
  openingReference: string,
): Promise<InventoryCostLayerRecord | null> {
  const [row] = await db
    .select()
    .from(inventoryCostLayers)
    .where(
      and(
        eq(inventoryCostLayers.organizationId, organizationId),
        eq(inventoryCostLayers.inventoryItemId, inventoryItemId),
        eq(inventoryCostLayers.openingReference, openingReference),
        eq(inventoryCostLayers.sourceKind, 'opening_balance'),
      ),
    )
    .limit(1);
  return row ? mapLayer(row) : null;
}

export async function insertInventoryCostLayer(
  db: DbExecutor,
  values: {
    readonly organizationId: string;
    readonly inventoryItemId: string;
    readonly sourceKind: string;
    readonly sourceExpenseId?: string | null;
    readonly sourceApBillId?: string | null;
    readonly openingReference?: string | null;
    readonly receivedOn: string;
    readonly receivedQty: string;
    readonly remainingQty: string;
    readonly unitCost: string;
    readonly currency: string;
  },
): Promise<InventoryCostLayerRecord> {
  return asServiceRoleWrite(db, async () => {
    const [row] = await db
      .insert(inventoryCostLayers)
      .values({
        organizationId: values.organizationId,
        inventoryItemId: values.inventoryItemId,
        sourceKind: values.sourceKind,
        sourceExpenseId: values.sourceExpenseId ?? null,
        sourceApBillId: values.sourceApBillId ?? null,
        openingReference: values.openingReference ?? null,
        receivedOn: values.receivedOn,
        receivedQty: normalizeQuantity(values.receivedQty),
        remainingQty: normalizeQuantity(values.remainingQty),
        unitCost: values.unitCost,
        currency: values.currency.toUpperCase(),
      })
      .returning();
    if (!row) throw new Error('Failed to insert inventory cost layer');
    return mapLayer(row);
  });
}

export async function updateLayerRemainingQty(
  db: DbExecutor,
  organizationId: string,
  layerId: string,
  remainingQty: string,
): Promise<void> {
  await asServiceRoleWrite(db, async () => {
    await db
      .update(inventoryCostLayers)
      .set({ remainingQty: normalizeQuantity(remainingQty), updatedAt: new Date() })
      .where(
        and(
          eq(inventoryCostLayers.id, layerId),
          eq(inventoryCostLayers.organizationId, organizationId),
        ),
      );
  });
}

export async function insertInventoryCostConsumptions(
  db: DbExecutor,
  rows: readonly {
    readonly organizationId: string;
    readonly inventoryItemId: string;
    readonly inventoryCostLayerId: string;
    readonly projectId: string | null;
    readonly movementId?: string | null;
    readonly materialUsageId?: string | null;
    readonly quantity: string;
    readonly amount: string;
    readonly currency: string;
    readonly kind: InventoryCostConsumptionKind;
    readonly occurredOn: string;
  }[],
): Promise<InventoryCostConsumptionRecord[]> {
  if (rows.length === 0) return [];
  return asServiceRoleWrite(db, async () => {
    const inserted = await db
      .insert(inventoryCostConsumptions)
      .values(
        rows.map((row) => ({
          organizationId: row.organizationId,
          inventoryItemId: row.inventoryItemId,
          inventoryCostLayerId: row.inventoryCostLayerId,
          projectId: row.projectId,
          movementId: row.movementId ?? null,
          materialUsageId: row.materialUsageId ?? null,
          quantity: normalizeQuantity(row.quantity),
          amount: row.amount,
          currency: row.currency.toUpperCase(),
          kind: row.kind,
          occurredOn: row.occurredOn,
        })),
      )
      .returning();
    return inserted.map(mapConsumption);
  });
}

export async function listConsumptionsByMovementId(
  db: DbExecutor,
  organizationId: string,
  movementId: string,
): Promise<InventoryCostConsumptionRecord[]> {
  const rows = await db
    .select()
    .from(inventoryCostConsumptions)
    .where(
      and(
        eq(inventoryCostConsumptions.organizationId, organizationId),
        eq(inventoryCostConsumptions.movementId, movementId),
      ),
    );
  return rows.map(mapConsumption);
}

export async function countConsumptionsByLayerId(
  db: DbExecutor,
  organizationId: string,
  layerId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryCostConsumptions)
    .where(
      and(
        eq(inventoryCostConsumptions.organizationId, organizationId),
        eq(inventoryCostConsumptions.inventoryCostLayerId, layerId),
      ),
    );
  return row?.count ?? 0;
}

export async function deleteInventoryCostLayer(
  db: DbExecutor,
  organizationId: string,
  layerId: string,
): Promise<boolean> {
  return asServiceRoleWrite(db, async () => {
    const deleted = await db
      .delete(inventoryCostLayers)
      .where(
        and(
          eq(inventoryCostLayers.id, layerId),
          eq(inventoryCostLayers.organizationId, organizationId),
        ),
      )
      .returning({ id: inventoryCostLayers.id });
    return deleted.length > 0;
  });
}

export async function listConsumptionsByMaterialUsageId(
  db: DbExecutor,
  organizationId: string,
  materialUsageId: string,
): Promise<InventoryCostConsumptionRecord[]> {
  const rows = await db
    .select()
    .from(inventoryCostConsumptions)
    .where(
      and(
        eq(inventoryCostConsumptions.organizationId, organizationId),
        eq(inventoryCostConsumptions.materialUsageId, materialUsageId),
      ),
    );
  return rows.map(mapConsumption);
}

export async function getInventoryItemCostBasis(
  db: DbExecutor,
  organizationId: string,
  inventoryItemId: string,
): Promise<{ amount: MoneyValue; currency: string | null } | null> {
  const [row] = await db
    .select({
      costBasisAmount: inventoryItems.costBasisAmount,
      costBasisCurrency: inventoryItems.costBasisCurrency,
    })
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.id, inventoryItemId),
        eq(inventoryItems.organizationId, organizationId),
        isNull(inventoryItems.archivedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  const currency = (row.costBasisCurrency ?? 'ILS').toUpperCase();
  return {
    amount: money(row.costBasisAmount, currency),
    currency: row.costBasisCurrency,
  };
}

export async function setInventoryItemCostBasis(
  db: DbExecutor,
  organizationId: string,
  inventoryItemId: string,
  basis: MoneyValue,
): Promise<void> {
  await db.execute(sql`select app.next_gen_latch_acquire('inventory_cost_basis')`);
  try {
    await db
      .update(inventoryItems)
      .set({
        costBasisAmount: basis.amount,
        costBasisCurrency: basis.currency.toUpperCase(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.organizationId, organizationId)),
      );
  } finally {
    await db.execute(sql`select app.next_gen_latch_release('inventory_cost_basis')`);
  }
}

/** Sum remaining layer values for an item (diagnostic / conservation checks). */
export async function sumRemainingLayerValueSql(
  db: DbExecutor,
  organizationId: string,
  inventoryItemId: string,
  currency: string,
): Promise<string> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${inventoryCostLayers.remainingQty} * ${inventoryCostLayers.unitCost}), 0)::text`,
    })
    .from(inventoryCostLayers)
    .where(
      and(
        eq(inventoryCostLayers.organizationId, organizationId),
        eq(inventoryCostLayers.inventoryItemId, inventoryItemId),
        eq(inventoryCostLayers.currency, currency.toUpperCase()),
      ),
    );
  return row?.total ?? '0';
}
