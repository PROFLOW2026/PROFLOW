/**
 * Explicit cost routing: project attribution vs auto GCM pool vs company-only.
 * Replaces inferred "unallocated" semantics (0084).
 */

export type AllocationIntent = 'project_allocate' | 'auto_pool' | 'company_only';

export const ALLOCATION_INTENTS: readonly AllocationIntent[] = [
  'project_allocate',
  'auto_pool',
  'company_only',
] as const;

export type CompensationClass = 'standard' | 'owner_manager';

export const COMPENSATION_CLASSES: readonly CompensationClass[] = [
  'standard',
  'owner_manager',
] as const;

export function isAllocationIntent(value: string | null | undefined): value is AllocationIntent {
  return value != null && (ALLOCATION_INTENTS as readonly string[]).includes(value);
}

export function isCompensationClass(value: string | null | undefined): value is CompensationClass {
  return value != null && (COMPENSATION_CLASSES as readonly string[]).includes(value);
}

/** Company-only costs never enter project Actual or GCM auto-allocation. */
export function isCompanyOnlyIntent(intent: AllocationIntent): boolean {
  return intent === 'company_only';
}

/** Auto-pool costs feed GCM monthly allocation. */
export function isAutoPoolIntent(intent: AllocationIntent): boolean {
  return intent === 'auto_pool';
}

/** Project-attributed costs use expense/labor/AP allocation lines. */
export function isProjectAllocateIntent(intent: AllocationIntent): boolean {
  return intent === 'project_allocate';
}

/**
 * Resolve expense allocation intent from capture input.
 * Overhead manual lines without project lines → company_only.
 */
export function resolveExpenseAllocationIntent(input: {
  readonly explicitIntent?: AllocationIntent | null;
  readonly projectId: string | null;
  readonly usesAutomaticDriver: boolean;
  readonly hasProjectAllocationLine: boolean;
  readonly hasOverheadAllocationLine: boolean;
  readonly costFamily: string;
}): AllocationIntent {
  if (input.explicitIntent && isAllocationIntent(input.explicitIntent)) {
    return input.explicitIntent;
  }
  if (input.projectId) return 'project_allocate';
  if (input.usesAutomaticDriver || input.hasProjectAllocationLine) {
    return 'project_allocate';
  }
  if (input.hasOverheadAllocationLine && !input.hasProjectAllocationLine) {
    return 'company_only';
  }
  if (input.costFamily === 'shared') {
    return 'project_allocate';
  }
  return 'auto_pool';
}

/** Whether a finalized expense should trigger missing-allocation attention. */
export function expenseMissingProjectAllocation(input: {
  readonly allocationIntent: AllocationIntent;
  readonly costFamily: string;
  readonly projectId: string | null;
  readonly hasProjectAllocationLine: boolean;
}): boolean {
  if (input.projectId) return false;
  if (input.allocationIntent === 'company_only') return false;
  if (input.allocationIntent === 'auto_pool') return false;
  if (input.costFamily !== 'shared') return false;
  return !input.hasProjectAllocationLine;
}

/** GCM auto-pool: expense contributes when intent is auto_pool and no project lines. */
export function expenseContributesToGcmAutoPool(input: {
  readonly allocationIntent: AllocationIntent;
  readonly projectId: string | null;
  readonly hasProjectAllocationLine: boolean;
  readonly autoPoolRemainderAmount?: string | number;
}): boolean {
  if (input.projectId) return false;
  if (input.hasProjectAllocationLine) {
    const remainder = Number(input.autoPoolRemainderAmount ?? 0);
    return input.allocationIntent === 'auto_pool' && remainder > 0;
  }
  return input.allocationIntent === 'auto_pool';
}

/** Company-only expense amount for org Actual (full NET or overhead-line portion). */
export function expenseCompanyOnlyAmount(input: {
  readonly allocationIntent: AllocationIntent;
  readonly netAmount: string;
  readonly overheadAllocatedAmount: string;
  readonly projectAllocatedAmount: string;
}): string {
  if (input.allocationIntent === 'company_only') {
    return input.netAmount;
  }
  if (input.overheadAllocatedAmount && Number(input.overheadAllocatedAmount) > 0) {
    return input.overheadAllocatedAmount;
  }
  return '0';
}
