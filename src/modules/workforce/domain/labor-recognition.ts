import {
  addMoney,
  isPositiveMoney,
  type MoneyValue,
} from '@/shared/money';

/**
 * Labor recognition Displacement invariant:
 * When an employee-month is applied/closed with recognition_source=monthly_allocated,
 * project labor Actual for that (employee, YYYY-MM) comes ONLY from
 * labor_allocation_run_lines - never also from time_entries.cost_amount.
 * Assignment never creates Actual. Employee economic cost appears exactly once.
 *
 * Month close may lock draft actual rows that still use time_snapshot (lockedAt only).
 * That preserves a reviewed employer actual without flipping recognition labels.
 */

export function isEmployerMonthCloseableAsApplied(input: {
  readonly status: string;
  readonly recognitionSource: string;
}): boolean {
  return input.status === 'applied' && input.recognitionSource === 'monthly_allocated';
}

export function isDraftActualTimeSnapshotLockableAtMonthClose(input: {
  readonly status: string;
  readonly knownQuality: string;
  readonly recognitionSource: string;
}): boolean {
  return (
    input.status === 'draft' &&
    input.knownQuality === 'actual' &&
    input.recognitionSource === 'time_snapshot'
  );
}

export function yearMonthFromWorkDate(workDate: string): string {
  const trimmed = workDate.trim();
  if (trimmed.length < 7) {
    throw new Error(`Invalid work date for year-month: "${workDate}"`);
  }
  return trimmed.slice(0, 7);
}

/** Stable key for an employee-calendar-month displacement slice. */
export function displacedEmployeeMonthKey(employeeId: string, yearMonth: string): string {
  return `${employeeId}:${yearMonth}`;
}

export function isTimeEntryDisplacedByMonth(
  employeeId: string,
  workDate: string,
  displacedKeys: ReadonlySet<string>,
): boolean {
  return displacedKeys.has(
    displacedEmployeeMonthKey(employeeId, yearMonthFromWorkDate(workDate)),
  );
}

/**
 * Merge residual (non-displaced) time True Cost with monthly allocation lines.
 * Callers must already exclude displaced time_entries from the residual side.
 */
export function mergeResidualTimeAndMonthlyAllocatedLabor(input: {
  readonly residualTimeLabor: MoneyValue;
  readonly monthlyAllocatedLabor: MoneyValue;
}): MoneyValue {
  return addMoney(input.residualTimeLabor, input.monthlyAllocatedLabor);
}

export function hasWorkforceLaborData(input: {
  readonly residualEntryCount: number;
  readonly monthlyAllocatedLabor: MoneyValue;
}): boolean {
  return input.residualEntryCount > 0 || isPositiveMoney(input.monthlyAllocatedLabor);
}
