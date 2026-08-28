import type { ExpenseStatus } from './types';
import type { ExpenseAttentionFilter } from './expense-attention';
import { resolveExpenseAttentionFilterFromQuery } from './expense-attention';

export const EXPENSE_LIST_STATUS_ALL = '__all__' as const;

export type ExpenseLifecycleStatusFilter = Extract<ExpenseStatus, 'finalized' | 'void'>;

/** Unified Expenses list status selector — lifecycle + existing actionable conditions. */
export type ExpenseListStatusFilter =
  | typeof EXPENSE_LIST_STATUS_ALL
  | ExpenseLifecycleStatusFilter
  | ExpenseAttentionFilter;

export const EXPENSE_LIST_STATUS_FILTER_OPTIONS = [
  'finalized',
  'void',
  'project_allocation',
  'classification',
  'approval',
] as const satisfies readonly ExpenseListStatusFilter[];

export function resolveExpenseListStatusFilterFromQuery(input: {
  readonly status?: string;
  readonly attention?: ExpenseAttentionFilter;
  readonly unallocated?: boolean;
}): ExpenseListStatusFilter {
  const attention = resolveExpenseAttentionFilterFromQuery(input);
  if (attention) return attention;
  if (input.status === 'finalized' || input.status === 'void') return input.status;
  if (input.status === 'draft') return 'approval';
  return EXPENSE_LIST_STATUS_ALL;
}

export function expenseListStatusFilterToSearchParams(
  value: ExpenseListStatusFilter,
): URLSearchParams {
  const params = new URLSearchParams();
  if (value === EXPENSE_LIST_STATUS_ALL) return params;
  if (value === 'project_allocation') {
    params.set('unallocated', 'true');
    return params;
  }
  if (value === 'classification' || value === 'approval') {
    params.set('attention', value);
    return params;
  }
  params.set('status', value);
  return params;
}

export function isExpenseListAttentionStatusFilter(
  value: ExpenseListStatusFilter,
): value is ExpenseAttentionFilter {
  return (
    value === 'project_allocation' || value === 'classification' || value === 'approval'
  );
}

export function expenseListStatusFilterIsActive(value: ExpenseListStatusFilter): boolean {
  return value !== EXPENSE_LIST_STATUS_ALL;
}
