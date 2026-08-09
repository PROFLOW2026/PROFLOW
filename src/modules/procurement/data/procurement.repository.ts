import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  committedCosts,
  materialItems,
  purchaseOrderLines,
  purchaseOrders,
  supplierQuotes,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export async function listMaterialItems(
  db: DbExecutor,
  organizationId: string,
): Promise<(typeof materialItems.$inferSelect)[]> {
  return db
    .select()
    .from(materialItems)
    .where(and(eq(materialItems.organizationId, organizationId), isNull(materialItems.archivedAt)))
    .orderBy(materialItems.name);
}

export async function insertMaterialItem(
  db: DbExecutor,
  values: typeof materialItems.$inferInsert,
): Promise<typeof materialItems.$inferSelect> {
  const [row] = await db.insert(materialItems).values(values).returning();
  if (!row) throw new Error('Failed to insert material item');
  return row;
}

export async function findMaterialItemById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<(typeof materialItems.$inferSelect) | null> {
  const [row] = await db
    .select()
    .from(materialItems)
    .where(and(eq(materialItems.id, id), eq(materialItems.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function findSupplierQuoteById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<(typeof supplierQuotes.$inferSelect) | null> {
  const [row] = await db
    .select()
    .from(supplierQuotes)
    .where(and(eq(supplierQuotes.id, id), eq(supplierQuotes.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function listPurchaseOrders(
  db: DbExecutor,
  organizationId: string,
  projectId?: string,
): Promise<(typeof purchaseOrders.$inferSelect)[]> {
  const filters = [
    eq(purchaseOrders.organizationId, organizationId),
    isNull(purchaseOrders.archivedAt),
  ];
  if (projectId) filters.push(eq(purchaseOrders.projectId, projectId));
  return db
    .select()
    .from(purchaseOrders)
    .where(and(...filters))
    .orderBy(desc(purchaseOrders.createdAt));
}

export async function findPurchaseOrderById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<typeof purchaseOrders.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function insertPurchaseOrder(
  db: DbExecutor,
  values: typeof purchaseOrders.$inferInsert,
): Promise<typeof purchaseOrders.$inferSelect> {
  const [row] = await db.insert(purchaseOrders).values(values).returning();
  if (!row) throw new Error('Failed to insert purchase order');
  return row;
}

export async function insertPurchaseOrderLines(
  db: DbExecutor,
  lines: (typeof purchaseOrderLines.$inferInsert)[],
): Promise<void> {
  if (lines.length === 0) return;
  await db.insert(purchaseOrderLines).values(lines);
}

export async function updatePurchaseOrderStatus(
  db: DbExecutor,
  organizationId: string,
  id: string,
  status: string,
): Promise<typeof purchaseOrders.$inferSelect | null> {
  const [row] = await db
    .update(purchaseOrders)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export async function insertCommittedCost(
  db: DbExecutor,
  values: typeof committedCosts.$inferInsert,
): Promise<typeof committedCosts.$inferSelect> {
  const [row] = await db.insert(committedCosts).values(values).returning();
  if (!row) throw new Error('Failed to insert committed cost');
  return row;
}

export async function findOpenCommittedCostForPo(
  db: DbExecutor,
  organizationId: string,
  purchaseOrderId: string,
): Promise<typeof committedCosts.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(committedCosts)
    .where(
      and(
        eq(committedCosts.organizationId, organizationId),
        eq(committedCosts.purchaseOrderId, purchaseOrderId),
      ),
    )
    .limit(1);
  return row ?? null;
}
