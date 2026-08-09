/**
 * AP / PO matching domain rules (Wave 3).
 *
 * HARD RULES:
 * - AP bill != Expense entity (matching never invents Expense rows).
 * - Posted/approved vendor bills DO recognize Actual Vendor Cost
 *   (see vendor-cost-recognition.ts) — distinct from the Expense table.
 * - Matching links a bill to a PO and/or an *existing* expense.
 * - Accepting a match never invents / auto-creates an Expense.
 * - Match != automatic posting; multiple partial matches are allowed.
 * - Vendor payment is cash only — not handled here as cost recognition.
 */

import { DomainRuleError } from '@/shared/errors';
import {
  addMoney,
  compareMoney,
  isZeroMoney,
  money,
  subtractMoney,
  toNumericString,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

export const AP_BILL_STATUSES = [
  'draft',
  'open',
  'partially_matched',
  'matched',
  'void',
] as const;

export type ApBillStatus = (typeof AP_BILL_STATUSES)[number];

export const AP_MATCH_STATUSES = ['proposed', 'accepted', 'rejected'] as const;
export type ApMatchStatus = (typeof AP_MATCH_STATUSES)[number];

/**
 * Partial matching is bill-level (`partially_matched`), not a match-row status.
 * Migration 0012 freezes match statuses to proposed/accepted/rejected.
 */
/** Accepting a match must never create Expense rows. */
export function isAcceptingMatchCreatingExpense(): false {
  return false;
}

/**
 * Match requires at least one target: purchase order and/or existing expense.
 * Schema enforces the same via CHECK; domain mirrors it for application paths.
 */
export function assertMatchHasTarget(input: {
  readonly purchaseOrderId?: string | null;
  readonly expenseId?: string | null;
}): void {
  if (!input.purchaseOrderId && !input.expenseId) {
    throw new DomainRuleError(
      'Match requires a purchase order and/or an existing expense',
      'ap.errors.targetRequired',
    );
  }
}

/**
 * Guard for acceptMatch: updates match status only; must not invent Expense.
 */
export function assertAcceptMatchDoesNotCreateExpense(): void {
  if (isAcceptingMatchCreatingExpense()) {
    throw new DomainRuleError(
      'Accepting an AP match must not create an expense',
      'ap.errors.expenseForbidden',
    );
  }
}

export function sumMatchAmounts(
  currency: string,
  amounts: readonly string[],
): MoneyValue {
  const code = currency.toUpperCase();
  let total = zeroMoney(code);
  for (const amount of amounts) {
    total = addMoney(total, money(amount, code));
  }
  return total;
}

/**
 * Remaining bill amount not yet covered by reserved matches
 * (typically accepted + proposed; rejected excluded).
 */
export function remainingUnmatchedAmount(input: {
  readonly currency: string;
  readonly billTotal: string;
  readonly reservedMatchedAmounts: readonly string[];
}): MoneyValue {
  const currency = input.currency.toUpperCase();
  const total = money(input.billTotal, currency);
  const reserved = sumMatchAmounts(currency, input.reservedMatchedAmounts);
  if (compareMoney(reserved, total) >= 0) {
    return zeroMoney(currency);
  }
  return subtractMoney(total, reserved);
}

export interface MatchVariance {
  readonly currency: string;
  readonly billTotal: string;
  readonly acceptedMatchedTotal: string;
  readonly remainingUnmatched: string;
  /** acceptedMatchedTotal − billTotal when over; otherwise "0". */
  readonly overMatchVariance: string;
  readonly isFullyMatched: boolean;
  readonly isPartiallyMatched: boolean;
  readonly hasOverMatchVariance: boolean;
}

/**
 * Variance visibility: accepted match sum vs bill total.
 * Does not create expenses — disclosure only.
 */
export function computeMatchVariance(input: {
  readonly currency: string;
  readonly billTotal: string;
  readonly acceptedMatchedAmounts: readonly string[];
}): MatchVariance {
  const currency = input.currency.toUpperCase();
  const billTotal = money(input.billTotal, currency);
  const accepted = sumMatchAmounts(currency, input.acceptedMatchedAmounts);
  const remaining = remainingUnmatchedAmount({
    currency,
    billTotal: input.billTotal,
    reservedMatchedAmounts: input.acceptedMatchedAmounts,
  });

  const over =
    compareMoney(accepted, billTotal) > 0
      ? subtractMoney(accepted, billTotal)
      : zeroMoney(currency);

  const isFullyMatched =
    !isZeroMoney(accepted) && compareMoney(accepted, billTotal) >= 0 && isZeroMoney(over);
  const isPartiallyMatched = !isZeroMoney(accepted) && compareMoney(accepted, billTotal) < 0;

  return {
    currency,
    billTotal: toNumericString(billTotal),
    acceptedMatchedTotal: toNumericString(accepted),
    remainingUnmatched: toNumericString(remaining),
    overMatchVariance: toNumericString(over),
    isFullyMatched: isFullyMatched || (!isZeroMoney(accepted) && isZeroMoney(remaining) && isZeroMoney(over)),
    isPartiallyMatched,
    hasOverMatchVariance: !isZeroMoney(over),
  };
}

/**
 * Reject proposing/accepting a match that would exceed the bill total
 * when combined with already reserved amounts.
 */
export function assertMatchDoesNotOverMatch(input: {
  readonly currency: string;
  readonly billTotal: string;
  readonly reservedMatchedAmounts: readonly string[];
  readonly additionalMatchedAmount: string;
}): void {
  const currency = input.currency.toUpperCase();
  const billTotal = money(input.billTotal, currency);
  const reserved = sumMatchAmounts(currency, input.reservedMatchedAmounts);
  const next = addMoney(reserved, money(input.additionalMatchedAmount, currency));
  if (compareMoney(next, billTotal) > 0) {
    throw new DomainRuleError(
      'Match amount would exceed the bill total',
      'ap.errors.overMatch',
    );
  }
}

/**
 * Currency integrity: match / PO / expense must share the bill currency.
 * Conversion is out of V1 scope.
 */
export function assertMatchCurrencyIntegrity(input: {
  readonly billCurrency: string;
  readonly matchCurrency: string;
  readonly purchaseOrderCurrency?: string | null;
  readonly expenseCurrency?: string | null;
}): void {
  const bill = input.billCurrency.toUpperCase();
  if (input.matchCurrency.toUpperCase() !== bill) {
    throw new DomainRuleError(
      'Match currency must match the bill currency',
      'ap.errors.currencyMismatch',
    );
  }
  if (
    input.purchaseOrderCurrency &&
    input.purchaseOrderCurrency.toUpperCase() !== bill
  ) {
    throw new DomainRuleError(
      'Purchase order currency must match the bill currency',
      'ap.errors.currencyMismatch',
    );
  }
  if (input.expenseCurrency && input.expenseCurrency.toUpperCase() !== bill) {
    throw new DomainRuleError(
      'Expense currency must match the bill currency',
      'ap.errors.currencyMismatch',
    );
  }
}

/**
 * Derive bill status from accepted match amounts vs bill total.
 * Does not create expenses — status only.
 */
export function deriveBillStatusFromAcceptedMatches(input: {
  readonly currency: string;
  readonly billTotal: string;
  readonly acceptedMatchedAmounts: readonly string[];
  readonly currentStatus: ApBillStatus;
}): ApBillStatus {
  if (input.currentStatus === 'void') return 'void';
  if (input.currentStatus === 'draft' && input.acceptedMatchedAmounts.length === 0) {
    return 'draft';
  }

  const variance = computeMatchVariance({
    currency: input.currency,
    billTotal: input.billTotal,
    acceptedMatchedAmounts: input.acceptedMatchedAmounts,
  });

  if (isZeroMoney(money(variance.acceptedMatchedTotal, variance.currency))) {
    return input.currentStatus === 'draft' ? 'draft' : 'open';
  }

  // Over-match must be rejected at propose/accept; never silently treat as matched.
  if (variance.hasOverMatchVariance) return 'partially_matched';
  if (variance.isFullyMatched) return 'matched';
  return 'partially_matched';
}
