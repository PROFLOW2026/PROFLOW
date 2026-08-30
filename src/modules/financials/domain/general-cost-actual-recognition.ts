import { currentYearMonth } from '@/modules/month-close';

/** Lexicographic YYYY-MM compare (valid for calendar months). */
export function compareYearMonth(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Whether `yearMonth` is economically recognized for Actual as-of `throughYearMonth` (inclusive). */
export function isYearMonthRecognizedForActual(
  yearMonth: string,
  throughYearMonth: string,
): boolean {
  return compareYearMonth(yearMonth, throughYearMonth) <= 0;
}

/** Org calendar month through which General Cost allocations count toward Actual. */
export function actualRecognitionThroughYearMonth(orgTimeZone: string): string {
  return currentYearMonth(orgTimeZone);
}

export function isFutureEconomicYearMonth(yearMonth: string, orgTimeZone: string): boolean {
  return !isYearMonthRecognizedForActual(yearMonth, actualRecognitionThroughYearMonth(orgTimeZone));
}
