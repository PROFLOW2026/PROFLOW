import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  apBillLines,
  apBills,
  committedCosts,
  projectBudgetLines,
  projectBudgets,
  purchaseOrderLines,
  purchaseOrders,
} from '@drizzle/schema';
import { RECOGNIZED_VENDOR_BILL_STATUSES } from '@/modules/ap/domain/vendor-cost-recognition';
import { applyLinkedExpenseDeductionsToContributions } from '@/modules/financials/domain/expense-ap-dedup';
import {
  loadProjectExpenseContributions,
  loadRecognizedVendorBillsForProject,
} from '@/modules/financials';
import type { DbExecutor } from '@/shared/db/types';
import type { CostCodeAmountSlice } from '../domain/cost-code-variance';

export type { CostCodeAmountSlice };

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

/** PO remaining commitment by cost code — prorates open committed_costs to lines (R-021). */
export async function loadCommittedAmountsByCostCodeForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<CostCodeAmountSlice[]> {
  const rows = await db
    .select({
      costCodeId: purchaseOrderLines.costCodeId,
      lineTotal: purchaseOrderLines.lineTotal,
      poCommitted: purchaseOrders.committedAmount,
      openCommitted: committedCosts.amount,
      currency: committedCosts.currency,
    })
    .from(committedCosts)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, committedCosts.purchaseOrderId))
    .innerJoin(
      purchaseOrderLines,
      and(
        eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id),
        eq(purchaseOrderLines.organizationId, purchaseOrders.organizationId),
      ),
    )
    .where(
      and(
        eq(committedCosts.organizationId, organizationId),
        eq(committedCosts.projectId, projectId),
        inArray(committedCosts.status, ['open', 'partially_consumed']),
        isNull(purchaseOrders.archivedAt),
        isNotNull(purchaseOrderLines.costCodeId),
      ),
    );

  const slices: CostCodeAmountSlice[] = [];
  for (const row of rows) {
    if (!row.costCodeId) continue;
    const poTotal = Number(row.poCommitted);
    const lineTotal = Number(row.lineTotal);
    const openAmount = Number(row.openCommitted);
    if (!Number.isFinite(poTotal) || poTotal <= 0 || !Number.isFinite(lineTotal)) continue;
    const prorated = (openAmount * lineTotal) / poTotal;
    slices.push({
      costCodeId: row.costCodeId,
      amount: prorated.toFixed(6),
      currency: row.currency,
    });
  }
  return slices;
}

/**
 * Actual path: same expense recognition as project compose (F01/F01b) + AP bill lines in NET.
 * Linked expense↔bill pairs use deduped expense contributions, not double-counted AP+expense.
 */
export async function loadActualAmountsByCostCodeForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<CostCodeAmountSlice[]> {
  const normalized = currency.toUpperCase();
  const [contributions, recognizedRollup] = await Promise.all([
    loadProjectExpenseContributions(db, organizationId, projectId),
    loadRecognizedVendorBillsForProject(db, organizationId, projectId, normalized),
  ]);

  const linked = recognizedRollup?.linkedExpenseDeductions ?? new Map<string, string>();
  const adjusted = applyLinkedExpenseDeductionsToContributions(contributions, linked);

  const slices: CostCodeAmountSlice[] = [];
  for (const line of adjusted) {
    if (!line.costCodeId) continue;
    if (line.currency.toUpperCase() !== normalized) continue;
    slices.push({
      costCodeId: line.costCodeId,
      amount: line.amount,
      currency: line.currency,
    });
  }

  const apCostCode = sql<string>`${apBillLines.costCodeId}`;
  const apRows = await db
    .select({
      costCodeId: apCostCode,
      amount: apBillLines.netAmount,
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
        isNull(apBills.archivedAt),
        eq(apBillLines.currency, normalized),
        sql`${apBillLines.costCodeId} is not null`,
      ),
    );

  for (const row of apRows) {
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
  const normalized = currency.toUpperCase();
  const [contributions, recognizedRollup] = await Promise.all([
    loadProjectExpenseContributions(db, organizationId, projectId),
    loadRecognizedVendorBillsForProject(db, organizationId, projectId, normalized),
  ]);
  const linked = recognizedRollup?.linkedExpenseDeductions ?? new Map<string, string>();
  const adjusted = applyLinkedExpenseDeductionsToContributions(contributions, linked);

  let expenseTotal = 0;
  for (const line of adjusted) {
    if (line.costCodeId) continue;
    if (line.currency.toUpperCase() !== normalized) continue;
    expenseTotal += Number(line.amount);
  }

  const [apSum] = await db
    .select({
      total: sql<string>`coalesce(sum(${apBillLines.netAmount}::numeric), 0)::text`,
    })
    .from(apBillLines)
    .innerJoin(apBills, eq(apBills.id, apBillLines.apBillId))
    .where(
      and(
        eq(apBillLines.organizationId, organizationId),
        eq(apBills.organizationId, organizationId),
        eq(apBills.projectId, projectId),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
        isNull(apBills.archivedAt),
        sql`${apBillLines.costCodeId} is null`,
        eq(apBillLines.currency, normalized),
      ),
    );

  const apTotal = Number(apSum?.total ?? 0);
  return String(expenseTotal + apTotal);
}
