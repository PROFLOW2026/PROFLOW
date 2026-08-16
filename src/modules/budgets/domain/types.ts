/**
 * Project/job budgets - control totals only.
 * Actual / Forecast / commitments always come from `modules/financials`.
 */

export const BUDGET_STATUSES = ['draft', 'active', 'superseded'] as const;
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

export const BUDGET_LINE_TYPES = [
  'total',
  'category',
  'work_package',
  'discipline',
  'cost_code',
] as const;
export type BudgetLineType = (typeof BUDGET_LINE_TYPES)[number];

export const BUDGET_AUDIT_ACTIONS = {
  BUDGET_CREATED: 'budget.created',
  BUDGET_REVISED: 'budget.revised',
  BUDGET_ARCHIVED: 'budget.archived',
} as const;

export interface ProjectBudgetRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly name: string;
  readonly status: BudgetStatus;
  readonly currency: string;
  readonly totalBudgetAmount: string | null;
  readonly currentRevisionNumber: number;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProjectBudgetLineRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly budgetId: string;
  readonly revisionNumber: number;
  readonly lineType: BudgetLineType;
  readonly categoryKey: string | null;
  readonly workPackageId: string | null;
  readonly disciplineKey: string | null;
  readonly costCode: string | null;
  readonly label: string;
  readonly budgetAmount: string;
  readonly etcAmount: string | null;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProjectBudgetRevisionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly budgetId: string;
  readonly revisionNumber: number;
  readonly reason: string;
  readonly snapshotTotalAmount: string | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Lightweight = single total line; advanced = category / WP / discipline / cost code. */
export type BudgetMode = 'lightweight' | 'advanced';

export function resolveBudgetMode(lines: readonly ProjectBudgetLineRecord[]): BudgetMode {
  if (lines.length === 0) return 'lightweight';
  if (lines.length === 1 && lines[0]!.lineType === 'total') return 'lightweight';
  return lines.every((line) => line.lineType === 'total') ? 'lightweight' : 'advanced';
}
