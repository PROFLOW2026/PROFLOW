import { and, eq, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm';
import {
  apBillLines,
  apBills,
  apPoMatches,
  expenseAllocations,
  expenses,
  projectBudgetLines,
  projectBudgets,
  purchaseOrderLines,
  purchaseOrders,
} from '@drizzle/schema';
import { RECOGNIZED_VENDOR_BILL_STATUSES } from '@/modules/ap/domain/vendor-cost-recognition';
import type { DbExecutor } from '@/shared/db/types';
import type { CostCodeAmountSlice } from '../domain/cost-code-variance';

export type { CostCodeAmountSlice };

const OPEN_PO_STATUSES = ['issued', 'partially_received', 'closed'] as const;

/** Budget amounts from active project budget lines attributed by catalog cost_code_id. */
export async function loadBudgetAmountsByCostCodeForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<CostCodeAmountSlice[]> {
  const rows = await db
    .select({
      costCodeId: projectBudgetLines.costCodeId,
      amount: projectBudgetLines.budgetAmount,
      currency: projectBudgets.currency,
    })
    .from(projectBudgetLines)
    .innerJoin(
      projectBudgets,
      and(
        eq(projectBudgets.id, projectBudgetLines.budgetId),
        eq(projectBudgets.organizationId, organizationId),
        eq(projectBudgets.projectId, projectId),
        eq(projectBudgets.status, 'active'),
        isNull(projectBudgets.archivedAt),
      ),
    )
    .where(
      and(
        eq(projectBudgetLines.organizationId, organizationId),
        eq(projectBudgetLines.revisionNumber, projectBudgets.currentRevisionNumber),
        isNotNull(projectBudgetLines.costCodeId),
      ),
    );

  return rows
    .filter((row): row is typeof row & { costCodeId: string } => row.costCodeId != null)
    .map((row) => ({
      costCodeId: row.costCodeId,
      amount: row.amount,
      currency: row.currency,
    }));
}

/** PO line totals (commitment path) — not Actual. Excludes draft/cancelled POs. */
export async function loadCommittedAmountsByCostCodeForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<CostCodeAmountSlice[]> {
  const rows = await db
    .select({
      costCodeId: purchaseOrderLines.costCodeId,
      amount: purchaseOrderLines.lineTotal,
      currency: purchaseOrderLines.currency,
    })
    .from(purchaseOrderLines)
    .innerJoin(
      purchaseOrders,
      and(
        eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId),
        eq(purchaseOrders.organizationId, organizationId),
        eq(purchaseOrders.projectId, projectId),
        isNull(purchaseOrders.archivedAt),
        inArray(purchaseOrders.status, [...OPEN_PO_STATUSES]),
      ),
    )
    .where(
      and(
        eq(purchaseOrderLines.organizationId, organizationId),
        isNotNull(purchaseOrderLines.costCodeId),
      ),
    );

  return rows
    .filter((row): row is typeof row & { costCodeId: string } => row.costCodeId != null)
    .map((row) => ({
      costCodeId: row.costCodeId,
      amount: row.amount,
      currency: row.currency,
    }));
}

async function loadLinkedExpenseIdsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ expenseId: apPoMatches.expenseId })
    .from(apPoMatches)
    .innerJoin(apBills, eq(apBills.id, apPoMatches.apBillId))
    .where(
      and(
        eq(apPoMatches.organizationId, organizationId),
        eq(apBills.organizationId, organizationId),
        eq(apBills.projectId, projectId),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
        isNotNull(apPoMatches.expenseId),
      ),
    );
  return new Set(
    rows.map((row) => row.expenseId).filter((id): id is string => id != null),
  );
}

/**
 * Actual path: finalized expense allocations + recognized AP bill lines.
 * Expense rows linked to recognized vendor bills are excluded to avoid double-counting.
 */
export async function loadActualAmountsByCostCodeForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<CostCodeAmountSlice[]> {
  const linkedExpenseIds = await loadLinkedExpenseIdsForProject(db, organizationId, projectId);
  const linkedList = [...linkedExpenseIds];

  const allocationFilters = [
    eq(expenseAllocations.organizationId, organizationId),
    eq(expenseAllocations.projectId, projectId),
    isNotNull(expenseAllocations.costCodeId),
    eq(expenses.status, 'finalized'),
    isNull(expenses.archivedAt),
  ];
  if (linkedList.length > 0) {
    allocationFilters.push(notInArray(expenses.id, linkedList));
  }

  const allocationRows = await db
    .select({
      costCodeId: expenseAllocations.costCodeId,
      amount: expenseAllocations.amount,
      currency: expenseAllocations.currency,
    })
    .from(expenseAllocations)
    .innerJoin(expenses, eq(expenses.id, expenseAllocations.expenseId))
    .where(and(...allocationFilters));

  const apRows = await db
    .select({
      costCodeId: apBillLines.costCodeId,
      amount: apBillLines.lineTotal,
      currency: apBillLines.currency,
    })
    .from(apBillLines)
    .innerJoin(apBills, eq(apBills.id, apBillLines.apBillId))
    .where(
      and(
        eq(apBillLines.organizationId, organizationId),
        eq(apBills.organizationId, organizationId),
        eq(apBills.projectId, projectId),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
        isNotNull(apBillLines.costCodeId),
      ),
    );

  const slices: CostCodeAmountSlice[] = [];
  for (const row of [...allocationRows, ...apRows]) {
    if (!row.costCodeId) continue;
    slices.push({
      costCodeId: row.costCodeId,
      amount: row.amount,
      currency: row.currency,
    });
  }
  return slices;
}

/** Unattributed actual total (same recognition rules, no cost_code_id). */
export async function loadUnattributedActualForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<string> {
  const linkedExpenseIds = await loadLinkedExpenseIdsForProject(db, organizationId, projectId);
  const linkedList = [...linkedExpenseIds];
  const normalized = currency.toUpperCase();

  const allocationFilters = [
    eq(expenseAllocations.organizationId, organizationId),
    eq(expenseAllocations.projectId, projectId),
    isNull(expenseAllocations.costCodeId),
    eq(expenses.status, 'finalized'),
    isNull(expenses.archivedAt),
    eq(expenseAllocations.currency, normalized),
  ];
  if (linkedList.length > 0) {
    allocationFilters.push(notInArray(expenses.id, linkedList));
  }

  const [allocSum] = await db
    .select({
      total: sql<string>`coalesce(sum(${expenseAllocations.amount}::numeric), 0)::text`,
    })
    .from(expenseAllocations)
    .innerJoin(expenses, eq(expenses.id, expenseAllocations.expenseId))
    .where(and(...allocationFilters));

  const [apSum] = await db
    .select({
      total: sql<string>`coalesce(sum(${apBillLines.lineTotal}::numeric), 0)::text`,
    })
    .from(apBillLines)
    .innerJoin(apBills, eq(apBills.id, apBillLines.apBillId))
    .where(
      and(
        eq(apBillLines.organizationId, organizationId),
        eq(apBills.organizationId, organizationId),
        eq(apBills.projectId, projectId),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
        isNull(apBillLines.costCodeId),
        eq(apBillLines.currency, normalized),
      ),
    );

  const a = Number(allocSum?.total ?? 0);
  const b = Number(apSum?.total ?? 0);
  return String(a + b);
}
