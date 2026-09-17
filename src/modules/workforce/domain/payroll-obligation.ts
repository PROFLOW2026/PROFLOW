import type { BusinessDate } from '@/shared/dates';

/** Provenance for employee_payroll_payments rows (migration 0092+). */
export const PAYROLL_OBLIGATION_SOURCES = [
  'period_accrual',
  'manual_correction',
  'recompute_legacy',
  'migration_unknown',
] as const;

export type PayrollObligationSource = (typeof PAYROLL_OBLIGATION_SOURCES)[number];

export function priorCalendarYearMonth(yearMonth: string): string {
  const [yearRaw, monthRaw] = yearMonth.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (month <= 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

/**
 * Payroll obligations may be created for the current or immediately prior work month only.
 * Older months with labor accrual but no row are intentionally not auto-invented.
 */
export function isPayrollObligationGenerationEligible(
  yearMonth: string,
  today: BusinessDate,
): boolean {
  const currentYearMonth = today.slice(0, 7);
  const priorYearMonth = priorCalendarYearMonth(currentYearMonth);
  return yearMonth === currentYearMonth || yearMonth === priorYearMonth;
}
