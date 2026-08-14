import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { MoneyValue } from '@/shared/money';
import type { BusinessDate } from '@/shared/dates';
import type { AllocationMethod, CostFamily } from './types';

/** Expense families that belong on the overhead home — not a second Actual. */
export const OVERHEAD_HOME_COST_FAMILIES = ['business_overhead', 'shared'] as const;

export type OverheadHomeCostFamily = (typeof OVERHEAD_HOME_COST_FAMILIES)[number];

export type OverheadAllocationRunStatus = 'draft' | 'applied' | 'superseded';

export interface OverheadAllocationRunSummary {
  readonly id: string;
  readonly expenseId: string;
  readonly expenseDescription: string | null;
  readonly costFamily: OverheadHomeCostFamily;
  readonly method: AllocationMethod;
  readonly status: OverheadAllocationRunStatus;
  readonly periodStart: BusinessDate;
  readonly periodEnd: BusinessDate;
  readonly allocatableNetAmount: MoneyValue;
  readonly runAt: Date;
}

export function isOverheadHomeCostFamily(family: CostFamily): family is OverheadHomeCostFamily {
  return (OVERHEAD_HOME_COST_FAMILIES as readonly string[]).includes(family);
}

/**
 * Page gate: expenses.read. Nav still hides behind the optional `overhead`
 * module like other optional destinations.
 */
export function canAccessOverheadHome(permissions: ReadonlySet<string>): boolean {
  return permissions.has(PERMISSIONS.EXPENSES_READ);
}
