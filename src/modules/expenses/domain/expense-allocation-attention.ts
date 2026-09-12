import type { AllocationIntent } from '@/modules/financials/domain/allocation-intent';
import { expenseMissingProjectAllocation } from '@/modules/financials/domain/allocation-intent';
import type { CostFamily } from './types';

/** Shared costs with project_allocate intent require explicit project lines. */
export function expenseCostFamilyRequiresProjectAllocation(costFamily: CostFamily): boolean {
  return costFamily === 'shared';
}

export function expenseRowRequiresProjectAllocation(input: {
  readonly status: 'draft' | 'finalized' | 'void';
  readonly projectId: string | null;
  readonly costFamily: CostFamily;
  readonly inventoryStockPurchase: boolean;
  readonly hasProjectAllocationLine: boolean;
  readonly allocationIntent?: AllocationIntent | null;
}): boolean {
  if (input.status !== 'finalized') return false;
  if (input.inventoryStockPurchase) return false;
  if (input.projectId) return false;
  const allocationIntent =
    input.allocationIntent ??
    (input.costFamily === 'shared' ? 'project_allocate' : 'auto_pool');
  return expenseMissingProjectAllocation({
    allocationIntent,
    costFamily: input.costFamily,
    projectId: input.projectId,
    hasProjectAllocationLine: input.hasProjectAllocationLine,
  });
}
