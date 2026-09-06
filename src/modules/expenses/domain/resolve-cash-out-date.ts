import type { BusinessDate } from '@/shared/dates';
import { compareBusinessDates } from '@/shared/dates';
import { nextOccurrenceOfDayOfMonth } from './cash-installment-schedule';
import { isPaymentMethodKey, PAYMENT_METHOD_CREDIT_CARD } from './payment-method';

export interface CashOutDateInput {
  readonly expenseDate: BusinessDate;
  /** Explicit user-entered paid / cash-out date — highest priority. */
  readonly explicitPaidAt: BusinessDate | null;
  readonly paymentMethod: string | null;
  readonly cardMonthlyDebitDay: number | null;
  readonly installmentDueDate: BusinessDate | null;
  readonly termDueDate: BusinessDate | null;
}

/**
 * Resolve when cash leaves the business.
 *
 * Priority:
 * 1. explicit paid/cash date entered by user
 * 2. installment / recurring schedule due date (when provided)
 * 3. credit-card monthly debit rule (when method is credit_card and debit day set)
 * 4. vendor/payment-term due date
 */
export function resolveExpenseCashOutDate(input: CashOutDateInput): BusinessDate | null {
  if (input.explicitPaidAt) {
    return input.explicitPaidAt;
  }

  if (input.installmentDueDate) {
    return input.installmentDueDate;
  }

  if (
    input.paymentMethod &&
    isPaymentMethodKey(input.paymentMethod) &&
    input.paymentMethod === PAYMENT_METHOD_CREDIT_CARD &&
    input.cardMonthlyDebitDay != null &&
    input.cardMonthlyDebitDay >= 1
  ) {
    return nextOccurrenceOfDayOfMonth(input.expenseDate, input.cardMonthlyDebitDay);
  }

  if (input.termDueDate) {
    return input.termDueDate;
  }

  return null;
}

/** Card default changes apply only to future scheduled payments — not explicit paid dates. */
export function shouldApplyCardDebitDefault(input: {
  readonly explicitPaidAt: BusinessDate | null;
  readonly paymentConfirmationSource: string | null;
}): boolean {
  if (input.explicitPaidAt) return false;
  if (input.paymentConfirmationSource === 'manual') return false;
  return true;
}

export function isFutureCashOutDate(cashOutDate: BusinessDate, today: BusinessDate): boolean {
  return compareBusinessDates(cashOutDate, today) > 0;
}
