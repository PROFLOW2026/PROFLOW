import { and, desc, eq, isNull } from 'drizzle-orm';
import { apBillLines, apBills, apPoMatches, expenses, purchaseOrders, vendors } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { ApBillStatus, ApMatchStatus } from '../domain/matching';

export type ApBillRow = typeof apBills.$inferSelect;
export type ApBillLineRow = typeof apBillLines.$inferSelect;
export type ApPoMatchRow = typeof apPoMatches.$inferSelect;

export interface ApBillListItem extends ApBillRow {
  readonly vendorName: string | null;
}

export async function listApBills(
  db: DbExecutor,
  organizationId: string,
): Promise<ApBillListItem[]> {
  const rows = await db
    .select({
      bill: apBills,
      vendorName: vendors.name,
    })
    .from(apBills)
    .leftJoin(vendors, eq(apBills.vendorId, vendors.id))
    .where(and(eq(apBills.organizationId, organizationId), isNull(apBills.archivedAt)))
    .orderBy(desc(apBills.createdAt));

  return rows.map((row) => ({
    ...row.bill,
    vendorName: row.vendorName,
  }));
}

export async function findApBillById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<ApBillRow | null> {
  const [row] = await db
    .select()
    .from(apBills)
    .where(and(eq(apBills.id, id), eq(apBills.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function insertApBill(
  db: DbExecutor,
  values: typeof apBills.$inferInsert,
): Promise<ApBillRow> {
  const [row] = await db.insert(apBills).values(values).returning();
  if (!row) throw new Error('Failed to insert AP bill');
  return row;
}

export async function insertApBillLines(
  db: DbExecutor,
  lines: (typeof apBillLines.$inferInsert)[],
): Promise<void> {
  if (lines.length === 0) return;
  await db.insert(apBillLines).values(lines);
}

export async function listApBillLines(
  db: DbExecutor,
  organizationId: string,
  apBillId: string,
): Promise<ApBillLineRow[]> {
  return db
    .select()
    .from(apBillLines)
    .where(and(eq(apBillLines.organizationId, organizationId), eq(apBillLines.apBillId, apBillId)))
    .orderBy(apBillLines.sortOrder);
}

export async function updateApBillStatus(
  db: DbExecutor,
  organizationId: string,
  id: string,
  status: ApBillStatus,
): Promise<ApBillRow | null> {
  const [row] = await db
    .update(apBills)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(apBills.id, id), eq(apBills.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export async function insertApPoMatch(
  db: DbExecutor,
  values: typeof apPoMatches.$inferInsert,
): Promise<ApPoMatchRow> {
  const [row] = await db.insert(apPoMatches).values(values).returning();
  if (!row) throw new Error('Failed to insert AP match');
  return row;
}

export async function findApPoMatchById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<ApPoMatchRow | null> {
  const [row] = await db
    .select()
    .from(apPoMatches)
    .where(and(eq(apPoMatches.id, id), eq(apPoMatches.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function listApPoMatchesForBill(
  db: DbExecutor,
  organizationId: string,
  apBillId: string,
): Promise<ApPoMatchRow[]> {
  return db
    .select()
    .from(apPoMatches)
    .where(
      and(eq(apPoMatches.organizationId, organizationId), eq(apPoMatches.apBillId, apBillId)),
    )
    .orderBy(desc(apPoMatches.createdAt));
}

export async function updateApPoMatchStatus(
  db: DbExecutor,
  organizationId: string,
  id: string,
  status: ApMatchStatus,
): Promise<ApPoMatchRow | null> {
  const [row] = await db
    .update(apPoMatches)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(apPoMatches.id, id),
        eq(apPoMatches.organizationId, organizationId),
        eq(apPoMatches.status, 'proposed'),
      ),
    )
    .returning();
  return row ?? null;
}

export async function listAcceptedMatchAmountsForBill(
  db: DbExecutor,
  organizationId: string,
  apBillId: string,
): Promise<string[]> {
  const rows = await db
    .select({ matchedAmount: apPoMatches.matchedAmount })
    .from(apPoMatches)
    .where(
      and(
        eq(apPoMatches.organizationId, organizationId),
        eq(apPoMatches.apBillId, apBillId),
        eq(apPoMatches.status, 'accepted'),
      ),
    );
  return rows.map((row) => row.matchedAmount);
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
      and(eq(vendors.id, vendorId), eq(vendors.organizationId, organizationId), isNull(vendors.archivedAt)),
    )
    .limit(1);
  return Boolean(row);
}

export async function findPurchaseOrderInOrg(
  db: DbExecutor,
  organizationId: string,
  purchaseOrderId: string,
): Promise<typeof purchaseOrders.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.id, purchaseOrderId),
        eq(purchaseOrders.organizationId, organizationId),
        isNull(purchaseOrders.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findExpenseInOrg(
  db: DbExecutor,
  organizationId: string,
  expenseId: string,
): Promise<{ id: string; currency: string; grossAmount: string } | null> {
  const [row] = await db
    .select({
      id: expenses.id,
      currency: expenses.currency,
      grossAmount: expenses.grossAmount,
      archivedAt: expenses.archivedAt,
    })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.organizationId, organizationId)))
    .limit(1);

  if (!row || row.archivedAt) return null;
  return { id: row.id, currency: row.currency, grossAmount: row.grossAmount };
}
