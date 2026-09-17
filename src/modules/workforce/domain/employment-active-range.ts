import type { BusinessDate } from '@/shared/dates';
import { compareBusinessDates } from '@/shared/dates';

export interface EmploymentRange {
  readonly hireDate: BusinessDate | null;
  readonly endDate: BusinessDate | null;
}

/** Day is within active employment — not applicable before hire or after end. */
export function isWithinEmploymentRange(
  workDate: BusinessDate,
  range: EmploymentRange,
): boolean {
  if (range.hireDate && compareBusinessDates(workDate, range.hireDate) < 0) {
    return false;
  }
  if (range.endDate && compareBusinessDates(workDate, range.endDate) > 0) {
    return false;
  }
  return true;
}

/** Employment period overlaps an inclusive business-date range (e.g. report month). */
export function employmentOverlapsDateRange(
  range: EmploymentRange,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): boolean {
  if (range.hireDate && compareBusinessDates(range.hireDate, toDate) > 0) {
    return false;
  }
  if (range.endDate && compareBusinessDates(range.endDate, fromDate) < 0) {
    return false;
  }
  return true;
}

/** Clamp a period range to the employee's active employment within inclusive bounds. */
export function effectiveEmploymentBoundsInRange(
  range: EmploymentRange,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): { fromDate: BusinessDate; toDate: BusinessDate } | null {
  if (!employmentOverlapsDateRange(range, fromDate, toDate)) {
    return null;
  }
  const effectiveFrom =
    range.hireDate && compareBusinessDates(range.hireDate, fromDate) > 0
      ? range.hireDate
      : fromDate;
  const effectiveTo =
    range.endDate && compareBusinessDates(range.endDate, toDate) < 0 ? range.endDate : toDate;
  return { fromDate: effectiveFrom, toDate: effectiveTo };
}

export type AttendanceDayState =
  | 'not_applicable'
  | 'worked'
  | 'not_worked_paid'
  | 'not_worked_unpaid'
  | 'missing';

export interface AttendanceOutcomeRow {
  readonly outcome: 'worked' | 'not_worked';
  readonly absenceCompensation: 'paid' | 'unpaid' | null;
}

export function resolveAttendanceDayState(input: {
  readonly workDate: BusinessDate;
  readonly employment: EmploymentRange;
  readonly outcome: AttendanceOutcomeRow | null;
}): AttendanceDayState {
  if (!isWithinEmploymentRange(input.workDate, input.employment)) {
    return 'not_applicable';
  }
  if (!input.outcome) return 'missing';
  if (input.outcome.outcome === 'worked') return 'worked';
  if (input.outcome.absenceCompensation === 'paid') return 'not_worked_paid';
  return 'not_worked_unpaid';
}

/**
 * Monthly global employee: reduce recognized amount by unpaid absence days ratio.
 * Missing reports do NOT reduce — only explicit not_worked + unpaid.
 */
export function adjustMonthlyCompensationForUnpaidAbsence(input: {
  readonly baseAmount: string;
  readonly relevantWorkDays: number;
  readonly unpaidAbsenceDays: number;
}): string {
  if (input.relevantWorkDays <= 0) return input.baseAmount;
  if (input.unpaidAbsenceDays <= 0) return input.baseAmount;
  const base = Number(input.baseAmount);
  if (!Number.isFinite(base)) return input.baseAmount;
  const workedDays = Math.max(0, input.relevantWorkDays - input.unpaidAbsenceDays);
  const adjusted = (base * workedDays) / input.relevantWorkDays;
  return adjusted.toFixed(6);
}
