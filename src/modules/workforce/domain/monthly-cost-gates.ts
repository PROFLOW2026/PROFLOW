/**
 * Optional monthly employer-cost review gates.
 *
 * 0021 applied + displacement wired into labor Actual rollup.
 * When true: applied/closed monthly_allocated months displace time snapshots.
 */

/** Post-0021: persistence + Displacement live in financial loaders. */
export const EMPLOYEE_MONTH_COSTS_READY = true as boolean;

let monthCostsReadyOverride: boolean | undefined;

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

/** Test-only override - mirrors `setApBillProjectAllocationsReadyForTests`. */
export function setEmployeeMonthCostsReadyForTests(ready: boolean | undefined): void {
  if (!isTestRuntime()) {
    throw new Error('setEmployeeMonthCostsReadyForTests is test-only');
  }
  monthCostsReadyOverride = ready;
}

export function areEmployeeMonthCostsAvailable(): boolean {
  if (monthCostsReadyOverride !== undefined) return monthCostsReadyOverride;
  if (
    isTestRuntime() &&
    (process.env.EMPLOYEE_MONTH_COSTS_READY === 'true' ||
      process.env.EMPLOYEE_MONTH_COSTS_READY === '1')
  ) {
    return true;
  }
  return EMPLOYEE_MONTH_COSTS_READY;
}

export const MONTHLY_ALLOCATION_METHODS = [
  'hours',
  'days',
  'percent',
  'fixed_amount',
] as const;

export type MonthlyAllocationMethod = (typeof MONTHLY_ALLOCATION_METHODS)[number];

export interface MonthlyCostReviewDraft {
  readonly yearMonth: string;
  readonly estimatedAmount: string;
  readonly actualAmount: string;
  readonly allocatedAmount: string;
  readonly method: MonthlyAllocationMethod;
}

/** Pure preview: known = estimated or actual; unallocated = max(0, known − allocated). */
export function previewMonthlyCostStrip(input: {
  readonly estimatedAmount: string;
  readonly actualAmount: string;
  readonly allocatedAmount: string;
}): {
  readonly knownAmount: string;
  readonly knownQuality: 'estimated' | 'actual';
  readonly allocatedAmount: string;
  readonly unallocatedAmount: string;
  readonly status: 'not_started' | 'partial' | 'balanced' | 'over';
} {
  const estimated = Number(input.estimatedAmount) || 0;
  const actual = Number(input.actualAmount) || 0;
  const allocated = Number(input.allocatedAmount) || 0;
  const useActual = actual > 0;
  const known = useActual ? actual : estimated;
  const unallocated = Math.max(0, known - allocated);
  const over = allocated > known + 1e-9;

  let status: 'not_started' | 'partial' | 'balanced' | 'over' = 'not_started';
  if (known <= 0 && allocated <= 0) status = 'not_started';
  else if (over) status = 'over';
  else if (unallocated <= 1e-9) status = 'balanced';
  else if (allocated > 0) status = 'partial';
  else status = 'not_started';

  return {
    knownAmount: known.toFixed(2),
    knownQuality: useActual ? 'actual' : 'estimated',
    allocatedAmount: allocated.toFixed(2),
    unallocatedAmount: unallocated.toFixed(2),
    status,
  };
}
