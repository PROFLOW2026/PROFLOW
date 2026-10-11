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

/**
 * Same trim / actual-wins rules as {@link deriveKnownEmployerCost} in monthly-allocation.
 * Keeps month-review preview strip aligned with persisted EMC known_amount.
 */
export function resolveKnownEmployerCostFields(input: {
  readonly estimatedAmount?: string | null;
  readonly actualAmount?: string | null;
}): {
  readonly knownQuality: 'estimated' | 'actual';
  readonly knownNumeric: number;
  readonly estimatedRaw: string | null;
  readonly actualRaw: string | null;
} {
  const estimatedRaw = input.estimatedAmount?.trim() || null;
  const actualRaw = input.actualAmount?.trim() || null;
  const actualNum = actualRaw ? Number(actualRaw) : 0;
  const useActual = Boolean(actualRaw) && Number.isFinite(actualNum) && actualNum > 0;

  if (useActual) {
    return {
      knownQuality: 'actual',
      knownNumeric: actualNum,
      estimatedRaw,
      actualRaw,
    };
  }

  const estimatedNum = estimatedRaw ? Number(estimatedRaw) : 0;
  return {
    knownQuality: 'estimated',
    knownNumeric: Number.isFinite(estimatedNum) ? estimatedNum : 0,
    estimatedRaw,
    actualRaw: null,
  };
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
  const { knownQuality, knownNumeric: known } = resolveKnownEmployerCostFields({
    estimatedAmount: input.estimatedAmount,
    actualAmount: input.actualAmount,
  });
  const allocated = Number(input.allocatedAmount) || 0;
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
    knownQuality,
    allocatedAmount: allocated.toFixed(2),
    unallocatedAmount: unallocated.toFixed(2),
    status,
  };
}
