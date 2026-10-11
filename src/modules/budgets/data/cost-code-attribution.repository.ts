import { and, eq, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm';
import {
  apBillLines,
  apBills,
  apPoMatches,
  committedCosts,
  expenseAllocations,
  expenses,
  projectBudgetLines,
  projectBudgets,
  purchaseOrderLines,
  purchaseOrders,
} from '@drizzle/schema';
import { RECOGNIZED_VENDOR_BILL_STATUSES } from '@/modules/ap/domain/vendor-cost-recognition';
import {
  applyLinkedExpenseDeductionsToContributions,
  buildLinkedExpenseDeductions,
} from '@/modules/financials/domain/expense-ap-dedup';
import type { ProjectExpenseContribution } from '@/modules/financials/domain/cost-aggregation';
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

async function loadLinkedExpenseIdsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<Set<string>> {
  const deductions = await loadLinkedExpenseDeductionsForProject(
    db,
    organizationId,
    projectId,
    'ILS',
  );
  return new Set(deductions.keys());
}

async function loadLinkedExpenseDeductionsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      expenseId: apPoMatches.expenseId,
      matchedAmount: apPoMatches.matchedAmount,
      expenseCurrency: expenses.currency,
    })
    .from(apPoMatches)
    .innerJoin(apBills, eq(apBills.id, apPoMatches.apBillId))
    .innerJoin(expenses, eq(expenses.id, apPoMatches.expenseId))
    .where(
      and(
        eq(apPoMatches.organizationId, organizationId),
        eq(apPoMatches.status, 'accepted'),
        eq(apBills.organizationId, organizationId),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
        isNull(apBills.archivedAt),
        isNotNull(apPoMatches.expenseId),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
        sql`(
          ${apBills.projectId} = ${projectId}
          OR EXISTS (
            SELECT 1 FROM ap_bill_project_allocations a
            WHERE a.ap_bill_id = ${apBills.id}
              AND a.organization_id = ${organizationId}
              AND a.target_type = 'project'
              AND a.project_id = ${projectId}
              AND a.status = 'applied'
          )
        )`,
      ),
    );
  return buildLinkedExpenseDeductions(
    rows.flatMap((row) =>
      row.expenseId
        ? [
            {
              expenseId: row.expenseId,
              matchedAmount: row.matchedAmount,
              expenseCurrency: row.expenseCurrency,
            },
          ]
        : [],
    ),
    currency,
  );
}

/**
 * Actual path: finalized expense allocations + recognized AP bill lines.
 * Expense rows linked to recognized vendor bills are excluded to avoid double-counting.
 * Cost code is COALESCE(line/allocation, header) so a header tag is not dropped (0074).
 */
export async function loadActualAmountsByCostCodeForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<CostCodeAmountSlice[]> {
  const linkedExpenseDeductions = await loadLinkedExpenseDeductionsForProject(
    db,
    organizationId,
    projectId,
    'ILS',
  );

  const allocationCostCode = sql<string>`${expenseAllocations.costCodeId}`;
  const allocationFilters = [
    eq(expenseAllocations.organizationId, organizationId),
    eq(expenseAllocations.projectId, projectId),
    sql`${expenseAllocations.costCodeId} is not null`,
    eq(expenses.status, 'finalized'),
    isNull(expenses.archivedAt),
  ];

  const allocationRows = await db
    .select({
      expenseId: expenses.id,
      costCodeId: allocationCostCode,
      amount: expenseAllocations.amount,
      currency: expenseAllocations.currency,
      costFamily: expenses.costFamily,
    })
    .from(expenseAllocations)
    .innerJoin(expenses, eq(expenses.id, expenseAllocations.expenseId))
    .where(and(...allocationFilters));

  const directRows = await db
    .select({
      expenseId: expenses.id,
      costCodeId: expenses.costCodeId,
      amount: expenses.netAmount,
      currency: expenses.currency,
      costFamily: expenses.costFamily,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        eq(expenses.projectId, projectId),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
        sql`${expenses.costCodeId} is not null`,
        sql`NOT EXISTS (
          SELECT 1 FROM ${expenseAllocations} a
          WHERE a.expense_id = ${expenses.id}
            AND a.organization_id = ${organizationId}
            AND a.project_id = ${projectId}
        )`,
      ),
    );

  const contributionLines: ProjectExpenseContribution[] = [
    ...allocationRows.map((row) => ({
      amount: row.amount,
      currency: row.currency,
      costFamily: row.costFamily as ProjectExpenseContribution['costFamily'],
      isDirectOnProject: false,
      isAllocated: true,
      isSubcontractor: false,
      projectId,
      expenseId: row.expenseId,
      costCodeId: row.costCodeId,
    })),
    ...directRows.map((row) => ({
      amount: row.amount,
      currency: row.currency,
      costFamily: row.costFamily as ProjectExpenseContribution['costFamily'],
      isDirectOnProject: true,
      isAllocated: false,
      isSubcontractor: false,
      projectId,
      expenseId: row.expenseId,
      costCodeId: row.costCodeId,
    })),
  ];

  const adjusted = applyLinkedExpenseDeductionsToContributions(
    contributionLines,
    linkedExpenseDeductions,
  );

  const apCostCode = sql<string>`${apBillLines.costCodeId}`;
  const apRows = await db
    .select({
      costCodeId: apCostCode,
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
        sql`${apBillLines.costCodeId} is not null`,
      ),
    );

  const slices: CostCodeAmountSlice[] = [];
  for (const line of adjusted) {
    if (!line.costCodeId) continue;
    slices.push({
      costCodeId: line.costCodeId,
      amount: line.amount,
      currency: line.currency,
    });
  }
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
  const linkedExpenseIds = await loadLinkedExpenseIdsForProject(db, organizationId, projectId);
  const linkedList = [...linkedExpenseIds];
  const normalized = currency.toUpperCase();

  const _allocationCostCode = sql`${expenseAllocations.costCodeId}`;
  const allocationFilters = [
    eq(expenseAllocations.organizationId, organizationId),
    eq(expenseAllocations.projectId, projectId),
    sql`${expenseAllocations.costCodeId} is null`,
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
        sql`${apBillLines.costCodeId} is null`,
        eq(apBillLines.currency, normalized),
      ),
    );

  const a = Number(allocSum?.total ?? 0);
  const b = Number(apSum?.total ?? 0);
  return String(a + b);
}
