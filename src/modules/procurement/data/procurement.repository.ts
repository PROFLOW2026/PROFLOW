import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  committedCosts,
  materialItems,
  materialVendorPrices,
  procurementRfqLines,
  procurementRfqs,
  purchaseOrderLines,
  purchaseOrders,
  supplierQuoteLines,
  supplierQuotes,
  vendors,
} from '@drizzle/schema';
import {
  ORG_LIST_EXPORT_CAP,
  ORG_LIST_HARD_CAP,
  resolveListLimit,
  resolveListOffset,
} from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';

/**
 * Procurement repositories always scope by organizationId (app-layer).
 * RLS on procurement / committed_costs tables is defense in depth only.
 */

export async function listMaterialItems(
  db: DbExecutor,
  organizationId: string,
  options: { readonly limit?: number; readonly offset?: number } = {},
): Promise<(typeof materialItems.$inferSelect)[]> {
  return db
    .select()
    .from(materialItems)
    .where(and(eq(materialItems.organizationId, organizationId), isNull(materialItems.archivedAt)))
    .orderBy(materialItems.name)
    .limit(
      resolveListLimit(options.limit, {
        hardCap:
          options.limit != null && options.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(options.offset));
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

export type MaterialVendorPriceRow = typeof materialVendorPrices.$inferSelect & {
  readonly vendorName: string;
};

export async function listMaterialVendorPrices(
  db: DbExecutor,
  organizationId: string,
  materialItemId: string,
): Promise<MaterialVendorPriceRow[]> {
  return db
    .select({
      id: materialVendorPrices.id,
      organizationId: materialVendorPrices.organizationId,
      materialItemId: materialVendorPrices.materialItemId,
      vendorId: materialVendorPrices.vendorId,
      unitPrice: materialVendorPrices.unitPrice,
      currency: materialVendorPrices.currency,
      effectiveFrom: materialVendorPrices.effectiveFrom,
      notes: materialVendorPrices.notes,
      createdAt: materialVendorPrices.createdAt,
      updatedAt: materialVendorPrices.updatedAt,
      vendorName: vendors.name,
    })
    .from(materialVendorPrices)
    .innerJoin(vendors, eq(vendors.id, materialVendorPrices.vendorId))
    .where(
      and(
        eq(materialVendorPrices.organizationId, organizationId),
        eq(materialVendorPrices.materialItemId, materialItemId),
      ),
    )
    .orderBy(desc(materialVendorPrices.effectiveFrom), desc(materialVendorPrices.createdAt));
}

export async function findMaterialVendorPriceById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<(typeof materialVendorPrices.$inferSelect) | null> {
  const [row] = await db
    .select()
    .from(materialVendorPrices)
    .where(
      and(eq(materialVendorPrices.id, id), eq(materialVendorPrices.organizationId, organizationId)),
    )
    .limit(1);
  return row ?? null;
}

export async function insertMaterialVendorPrice(
  db: DbExecutor,
  values: typeof materialVendorPrices.$inferInsert,
): Promise<typeof materialVendorPrices.$inferSelect> {
  const [row] = await db.insert(materialVendorPrices).values(values).returning();
  if (!row) throw new Error('Failed to insert material vendor price');
  return row;
}

export async function updateMaterialVendorPrice(
  db: DbExecutor,
  organizationId: string,
  id: string,
  values: Partial<
    Pick<
      typeof materialVendorPrices.$inferInsert,
      'vendorId' | 'unitPrice' | 'currency' | 'effectiveFrom' | 'notes'
    >
  >,
): Promise<(typeof materialVendorPrices.$inferSelect) | null> {
  const [row] = await db
    .update(materialVendorPrices)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(eq(materialVendorPrices.id, id), eq(materialVendorPrices.organizationId, organizationId)),
    )
    .returning();
  return row ?? null;
}

export async function deleteMaterialVendorPrice(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<(typeof materialVendorPrices.$inferSelect) | null> {
  const [row] = await db
    .delete(materialVendorPrices)
    .where(
      and(eq(materialVendorPrices.id, id), eq(materialVendorPrices.organizationId, organizationId)),
    )
    .returning();
  return row ?? null;
}

export async function listProcurementRfqs(
  db: DbExecutor,
  organizationId: string,
  options: { readonly limit?: number; readonly offset?: number } = {},
): Promise<(typeof procurementRfqs.$inferSelect)[]> {
  return db
    .select()
    .from(procurementRfqs)
    .where(and(eq(procurementRfqs.organizationId, organizationId), isNull(procurementRfqs.archivedAt)))
    .orderBy(desc(procurementRfqs.createdAt))
    .limit(
      resolveListLimit(options.limit, {
        hardCap:
          options.limit != null && options.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(options.offset));
}

export async function findProcurementRfqById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<(typeof procurementRfqs.$inferSelect) | null> {
  const [row] = await db
    .select()
    .from(procurementRfqs)
    .where(and(eq(procurementRfqs.id, id), eq(procurementRfqs.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function insertProcurementRfq(
  db: DbExecutor,
  values: typeof procurementRfqs.$inferInsert,
): Promise<typeof procurementRfqs.$inferSelect> {
  const [row] = await db.insert(procurementRfqs).values(values).returning();
  if (!row) throw new Error('Failed to insert RFQ');
  return row;
}

export async function insertProcurementRfqLines(
  db: DbExecutor,
  lines: (typeof procurementRfqLines.$inferInsert)[],
): Promise<void> {
  if (lines.length === 0) return;
  await db.insert(procurementRfqLines).values(lines);
}

export async function listProcurementRfqLines(
  db: DbExecutor,
  organizationId: string,
  rfqId: string,
): Promise<(typeof procurementRfqLines.$inferSelect)[]> {
  return db
    .select()
    .from(procurementRfqLines)
    .where(
      and(
        eq(procurementRfqLines.organizationId, organizationId),
        eq(procurementRfqLines.rfqId, rfqId),
      ),
    )
    .orderBy(procurementRfqLines.sortOrder);
}

export async function updateProcurementRfqStatus(
  db: DbExecutor,
  organizationId: string,
  id: string,
  status: string,
): Promise<(typeof procurementRfqs.$inferSelect) | null> {
  const [row] = await db
    .update(procurementRfqs)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(procurementRfqs.id, id), eq(procurementRfqs.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export async function assertVendorInOrganization(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(
      and(
        eq(vendors.id, vendorId),
        eq(vendors.organizationId, organizationId),
        isNull(vendors.archivedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export type SupplierQuoteListRow = typeof supplierQuotes.$inferSelect & {
  readonly vendorName: string | null;
};

export async function listSupplierQuotesForRfq(
  db: DbExecutor,
  organizationId: string,
  rfqId: string,
): Promise<SupplierQuoteListRow[]> {
  return db
    .select({
      id: supplierQuotes.id,
      organizationId: supplierQuotes.organizationId,
      rfqId: supplierQuotes.rfqId,
      vendorId: supplierQuotes.vendorId,
      projectId: supplierQuotes.projectId,
      status: supplierQuotes.status,
      currency: supplierQuotes.currency,
      totalAmount: supplierQuotes.totalAmount,
      receivedOn: supplierQuotes.receivedOn,
      notes: supplierQuotes.notes,
      archivedAt: supplierQuotes.archivedAt,
      createdAt: supplierQuotes.createdAt,
      updatedAt: supplierQuotes.updatedAt,
      vendorName: vendors.name,
    })
    .from(supplierQuotes)
    .leftJoin(vendors, eq(vendors.id, supplierQuotes.vendorId))
    .where(
      and(
        eq(supplierQuotes.organizationId, organizationId),
        eq(supplierQuotes.rfqId, rfqId),
        isNull(supplierQuotes.archivedAt),
      ),
    )
    .orderBy(desc(supplierQuotes.createdAt));
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

export async function insertSupplierQuote(
  db: DbExecutor,
  values: typeof supplierQuotes.$inferInsert,
): Promise<typeof supplierQuotes.$inferSelect> {
  const [row] = await db.insert(supplierQuotes).values(values).returning();
  if (!row) throw new Error('Failed to insert supplier quote');
  return row;
}

export async function insertSupplierQuoteLines(
  db: DbExecutor,
  lines: (typeof supplierQuoteLines.$inferInsert)[],
): Promise<void> {
  if (lines.length === 0) return;
  await db.insert(supplierQuoteLines).values(lines);
}

export async function listSupplierQuoteLines(
  db: DbExecutor,
  organizationId: string,
  supplierQuoteId: string,
): Promise<(typeof supplierQuoteLines.$inferSelect)[]> {
  return db
    .select()
    .from(supplierQuoteLines)
    .where(
      and(
        eq(supplierQuoteLines.organizationId, organizationId),
        eq(supplierQuoteLines.supplierQuoteId, supplierQuoteId),
      ),
    )
    .orderBy(supplierQuoteLines.sortOrder);
}

export async function updateSupplierQuoteStatus(
  db: DbExecutor,
  organizationId: string,
  id: string,
  status: string,
): Promise<(typeof supplierQuotes.$inferSelect) | null> {
  const [row] = await db
    .update(supplierQuotes)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(supplierQuotes.id, id), eq(supplierQuotes.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export async function listPurchaseOrders(
  db: DbExecutor,
  organizationId: string,
  projectId?: string,
  options: { readonly limit?: number; readonly offset?: number } = {},
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
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(
      resolveListLimit(options.limit, {
        hardCap:
          options.limit != null && options.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(options.offset));
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

export async function listPurchaseOrderLines(
  db: DbExecutor,
  organizationId: string,
  purchaseOrderId: string,
): Promise<(typeof purchaseOrderLines.$inferSelect)[]> {
  return db
    .select()
    .from(purchaseOrderLines)
    .where(
      and(
        eq(purchaseOrderLines.organizationId, organizationId),
        eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId),
      ),
    )
    .orderBy(purchaseOrderLines.sortOrder);
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
        inArray(committedCosts.status, ['open', 'partially_consumed']),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function updateCommittedCostConsumption(
  db: DbExecutor,
  organizationId: string,
  committedCostId: string,
  values: { amount: string; status: string },
): Promise<typeof committedCosts.$inferSelect | null> {
  const [row] = await db
    .update(committedCosts)
    .set({
      amount: values.amount,
      status: values.status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(committedCosts.id, committedCostId),
        eq(committedCosts.organizationId, organizationId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function listCommittedCostsForPurchaseOrders(
  db: DbExecutor,
  organizationId: string,
  purchaseOrderIds: string[],
): Promise<(typeof committedCosts.$inferSelect)[]> {
  if (purchaseOrderIds.length === 0) return [];
  return db
    .select()
    .from(committedCosts)
    .where(
      and(
        eq(committedCosts.organizationId, organizationId),
        inArray(committedCosts.purchaseOrderId, purchaseOrderIds),
      ),
    );
}
