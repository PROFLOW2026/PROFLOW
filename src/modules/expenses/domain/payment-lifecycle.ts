import type { BusinessDate } from '@/shared/dates';
import { compareBusinessDates } from '@/shared/dates';
import type { ExpensePaymentStatus, PaymentConfirmationSource } from '@/modules/tenancy/domain/org-financial-policies';
import { resolveExpensePaymentStatus } from '@/modules/tenancy/domain/org-financial-policies';

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
}

export function effectiveExpensePaymentStatus(
  row: Pick<ExpensePaymentRow, 'paymentStatus' | 'dueDate' | 'paidAt'>,
  today: BusinessDate,
): ExpensePaymentStatus | null {
  if (row.paidAt) return 'paid';
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
  return status === 'due' && !row.paidAt;
}

export function isExpenseOverdue(row: ExpensePaymentRow, today: BusinessDate): boolean {
  const status = effectiveExpensePaymentStatus(row, today);
  return status === 'overdue' && !row.paidAt;
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
