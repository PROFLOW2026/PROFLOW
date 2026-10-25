import type { ExpenseDetail, ExpenseSummary } from './types';
import {
  expenseCostFamilyRequiresProjectAllocation,
  expenseRowRequiresProjectAllocation,
} from './expense-allocation-attention';
import { buildExpenseDetailHref } from './expense-return-navigation';

/** Row-level actionable conditions — no new workflow states. */
export type ExpenseAttentionRequired = 'project_allocation' | 'classification' | 'approval';

/** List filter. `any` matches every actionable condition. */
export type ExpenseAttentionFilter = ExpenseAttentionRequired | 'any';

export type ExpenseAttentionEligibility = Pick<
  ExpenseSummary,
  'status' | 'voidsExpenseId' | 'adjustsExpenseId' | 'hasActiveReversal'
>;

/** Only active lifecycle rows may receive attention badges or filter counts. */
export function isExpenseAttentionEligible(expense: ExpenseAttentionEligibility): boolean {
  if (expense.status === 'void') return false;
  if (expense.voidsExpenseId) return false;
  if (expense.adjustsExpenseId) return false;
  if (expense.hasActiveReversal) return false;
  return true;
}

export function resolveExpenseAttentionFilterFromQuery(input: {
  readonly unallocated?: boolean;
  readonly attention?: ExpenseAttentionFilter;
}): ExpenseAttentionFilter | undefined {
  if (input.unallocated) return 'project_allocation';
  return input.attention;
}

export function listExpenseAttentionRequired(
  expense: ExpenseSummary,
  options: { readonly assumeProjectAllocation?: boolean } = {},
): readonly ExpenseAttentionRequired[] {
  if (!isExpenseAttentionEligible(expense)) return [];
  const issues: ExpenseAttentionRequired[] = [];
  if (expense.status === 'draft') issues.push('approval');
  if (expense.classificationStatus === 'needs_classification') issues.push('classification');
  const needsAllocation =
    expenseCostFamilyRequiresProjectAllocation(expense.costFamily) &&
    (options.assumeProjectAllocation || expense.needsProjectAllocation === true);
  if (needsAllocation) issues.push('project_allocation');
  return issues;
}

export function resolveExpenseAttentionRequired(
  expense: ExpenseSummary,
  options: { readonly assumeProjectAllocation?: boolean } = {},
): ExpenseAttentionRequired | null {
  return listExpenseAttentionRequired(expense, options)[0] ?? null;
}

export function countExpensesNeedingAttention(items: readonly ExpenseSummary[]): number {
  return items.filter((expense) => resolveExpenseAttentionRequired(expense) != null).length;
}

/** Prefer dashboard-aligned allocation filter when mixed actionable rows appear on one page. */
export function pickAttentionFilterFromItems(
  items: readonly ExpenseSummary[],
): ExpenseAttentionFilter | null {
  const priorities: readonly ExpenseAttentionRequired[] = [
    'project_allocation',
    'approval',
    'classification',
  ];
  const present = new Set(
    items
      .map((expense) => resolveExpenseAttentionRequired(expense))
      .filter((value): value is ExpenseAttentionRequired => value != null),
  );
  return priorities.find((filter) => present.has(filter)) ?? null;
}

export function expenseListShowsAttentionColumns(activeAttention?: ExpenseAttentionFilter): boolean {
  return activeAttention != null;
}

export function expenseNeedsProjectAllocationFromDetail(expense: ExpenseDetail): boolean {
  return expenseRowRequiresProjectAllocation({
    status: expense.status,
    projectId: expense.projectId,
    costFamily: expense.costFamily,
    inventoryStockPurchase: expense.inventoryStockPurchase,
    allocationIntent: expense.allocationIntent,
    hasProjectAllocationLine: expense.allocations.some(
      (line) => line.targetType === 'project' && line.projectId != null,
    ),
  });
}

export { expenseCostFamilyRequiresProjectAllocation };

export function resolveExpenseDetailAttention(
  expense: ExpenseDetail,
  options: { readonly hasActiveReversal?: boolean } = {},
): ExpenseAttentionRequired | null {
  const summary: ExpenseSummary = {
    id: expense.id,
    expenseDate: expense.expenseDate,
    description: expense.description,
    supplierName: expense.supplierName,
    vendorId: expense.vendorId,
    vendorName: null,
    projectId: expense.projectId,
    projectName: expense.projectName,
    workPackageId: expense.workPackageId,
    costFamily: expense.costFamily,
    costCategoryId: expense.costCategoryId,
    classificationStatus: expense.classificationStatus,
    grossAmount: expense.grossAmount,
    netAmount: expense.netAmount,
    taxAmount: expense.taxAmount,
    status: expense.status,
    voidsExpenseId: expense.voidsExpenseId,
    adjustsExpenseId: expense.adjustsExpenseId,
    needsProjectAllocation: expenseNeedsProjectAllocationFromDetail(expense),
    hasActiveReversal: options.hasActiveReversal ?? false,
  };
  return resolveExpenseAttentionRequired(summary);
}

export function expenseAttentionFocusParam(
  required: ExpenseAttentionRequired,
): 'allocation' | 'classification' | 'approval' {
  if (required === 'project_allocation') return 'allocation';
  if (required === 'classification') return 'classification';
  return 'approval';
}

export function expenseAttentionActionHref(
  expenseId: string,
  required: ExpenseAttentionRequired | null,
  options: { readonly returnTo?: string | null } = {},
): string {
  return buildExpenseDetailHref(expenseId, {
    focus: required ? expenseAttentionFocusParam(required) : undefined,
    returnTo: options.returnTo,
  });
}
