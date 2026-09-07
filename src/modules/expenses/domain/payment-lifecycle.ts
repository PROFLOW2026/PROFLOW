import type { BusinessDate } from '@/shared/dates';
import { addDays, compareBusinessDates } from '@/shared/dates';
import type { ExpensePaymentStatus, PaymentConfirmationSource } from '@/modules/tenancy/domain/org-financial-policies';
import { resolveExpensePaymentStatus } from '@/modules/tenancy/domain/org-financial-policies';
import { fromNumericString, isPositiveMoney } from '@/shared/money';
import {
  isExpenseAttentionEligible,
  type ExpenseAttentionEligibility,
} from './expense-attention';
import { PAYMENT_DUE_SOON_DAYS } from './payment-behavior';

export interface ExpensePaymentRow {
  readonly id: string;
  readonly expenseDate: BusinessDate;
  readonly dueDate: BusinessDate | null;
  readonly paymentStatus: ExpensePaymentStatus | null;
  readonly paidAt: BusinessDate | null;
  readonly paidGrossAmount: string | null;
  readonly paymentConfirmationSource: PaymentConfirmationSource | null;
  readonly grossAmount: string;
  readonly currency: string;
  readonly description: string | null;
  readonly supplierName: string | null;
  readonly projectId: string | null;
  readonly status: string;
  readonly vendorId?: string | null;
  readonly costCategoryId?: string | null;
  readonly automaticInstallmentPayment?: boolean;
  readonly installmentCount?: number;
  readonly voidsExpenseId?: string | null;
  readonly adjustsExpenseId?: string | null;
  readonly hasActiveReversal?: boolean;
}

export type ExpensePaymentObligationInput = ExpenseAttentionEligibility &
  Pick<ExpensePaymentRow, 'grossAmount' | 'currency'>;

/**
 * Canonical payment-action eligibility: financially active obligation with positive payable.
 * Reuses expense attention lifecycle (void / reversal / adjustment neutralization).
 */
export function isExpensePaymentObligationEligible(expense: ExpensePaymentObligationInput): boolean {
  if (!isExpenseAttentionEligible(expense)) return false;
  const gross = fromNumericString(expense.grossAmount, expense.currency);
  if (!gross || !isPositiveMoney(gross)) return false;
  return true;
}

export function effectiveExpensePaymentStatus(
  row: Pick<ExpensePaymentRow, 'paymentStatus' | 'dueDate' | 'paidAt'>,
  today: BusinessDate,
): ExpensePaymentStatus | null {
  if (row.paidAt && row.paymentStatus === 'paid') return 'paid';
  return resolveExpensePaymentStatus({
    paymentStatus: row.paymentStatus,
    dueDate: row.dueDate,
    paidAt: row.paidAt,
    today,
  });
}

export function expenseCashOutAmount(row: ExpensePaymentRow): string | null {
  if (row.paidAt && row.paidGrossAmount) return row.paidGrossAmount;
  return null;
}

export function isExpenseDueToday(row: ExpensePaymentRow, today: BusinessDate): boolean {
  const status = effectiveExpensePaymentStatus(row, today);
  return status === 'due' && row.paymentStatus !== 'paid';
}

export function isExpenseOverdue(row: ExpensePaymentRow, today: BusinessDate): boolean {
  const status = effectiveExpensePaymentStatus(row, today);
  return status === 'overdue' && row.paymentStatus !== 'paid';
}

export function isExpenseDueSoon(
  row: ExpensePaymentRow,
  today: BusinessDate,
  soonDays = PAYMENT_DUE_SOON_DAYS,
): boolean {
  if (row.paymentStatus === 'paid' || !row.dueDate) return false;
  if (compareBusinessDates(row.dueDate, today) <= 0) return false;
  const soonUntil = addDays(today, soonDays);
  return compareBusinessDates(row.dueDate, soonUntil) <= 0;
}

export function isExpenseUpcoming(row: ExpensePaymentRow, today: BusinessDate): boolean {
  const status = effectiveExpensePaymentStatus(row, today);
  return status === 'upcoming' && row.paymentStatus !== 'paid';
}

/** Legacy or unset due date — never treated as overdue; may still need owner review. */
export function isExpensePendingReview(row: ExpensePaymentRow): boolean {
  if (row.paymentStatus === 'paid') return false;
  if ((row.installmentCount ?? 1) > 1) return false;
  if (row.dueDate) return false;
  const rawStatus = row.paymentStatus as string | null;
  return rawStatus === null || rawStatus === 'legacy_unknown';
}

export function sortByDueDate<T extends { readonly dueDate: BusinessDate | null }>(
  rows: readonly T[],
): readonly T[] {
  return [...rows].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return compareBusinessDates(a.dueDate, b.dueDate);
  });
}
