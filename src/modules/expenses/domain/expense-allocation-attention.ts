import type { CostFamily } from './types';

/** Shared costs are expected to reach projects; business overhead may stay company-only. */
export function expenseCostFamilyRequiresProjectAllocation(costFamily: CostFamily): boolean {
  return costFamily === 'shared';
}

export function expenseRowRequiresProjectAllocation(input: {
  readonly status: 'draft' | 'finalized' | 'void';
  readonly projectId: string | null;
  readonly costFamily: CostFamily;
  readonly inventoryStockPurchase: boolean;
  readonly hasProjectAllocationLine: boolean;
}): boolean {
  if (input.status !== 'finalized') return false;
  if (input.inventoryStockPurchase) return false;
  if (input.projectId) return false;
  if (!expenseCostFamilyRequiresProjectAllocation(input.costFamily)) return false;
  return !input.hasProjectAllocationLine;
}
