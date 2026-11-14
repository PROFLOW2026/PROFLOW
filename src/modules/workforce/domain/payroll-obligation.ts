import { compareBusinessDates, type BusinessDate } from '@/shared/dates';

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
/**
 * A paid month shows the recorded paid amount. An unpaid month shows the expected amount.
 * The expected figure must not stand in for a payment that was later corrected.
 */
export function displayedPayrollAmount(input: {
  readonly paidAt: string | null;
  readonly paidAmount: string | null;
  readonly expectedAmount: string;
}): string {
  if (input.paidAt && input.paidAmount != null && input.paidAmount.trim() !== '') {
    return input.paidAmount;
  }
  return input.expectedAmount;
}

/** Command Center + alerts: unpaid obligation urgency from due date vs org today. */
export type UnpaidPayrollAlertStatus = 'pending_review' | 'overdue' | 'due' | 'upcoming';

export type DisplayedPayrollPaymentStatus = 'paid' | UnpaidPayrollAlertStatus;

export function resolveUnpaidPayrollAlertStatus(
  dueDate: BusinessDate | null,
  today: BusinessDate,
): UnpaidPayrollAlertStatus {
  if (!dueDate) return 'pending_review';
  if (compareBusinessDates(dueDate, today) < 0) return 'overdue';
  if (dueDate === today) return 'due';
  return 'upcoming';
}

/**
 * Badge / panel status. Paid only when paidAt is set — never inferred from employer-cost edits.
 * Unpaid rows use due date vs today (stored payment_status may stay stale as `upcoming`).
 */
export function resolveDisplayedPayrollPaymentStatus(input: {
  readonly paidAt: string | null;
  readonly dueDate: BusinessDate | null;
  readonly today: BusinessDate;
}): DisplayedPayrollPaymentStatus {
  if (input.paidAt) return 'paid';
  return resolveUnpaidPayrollAlertStatus(input.dueDate, input.today);
}

export function isPayrollObligationGenerationEligible(
  yearMonth: string,
  today: BusinessDate,
): boolean {
  const currentYearMonth = today.slice(0, 7);
  const priorYearMonth = priorCalendarYearMonth(currentYearMonth);
  return yearMonth === currentYearMonth || yearMonth === priorYearMonth;
}
