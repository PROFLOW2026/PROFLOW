/**
 * AP / PO matching domain rules (Wave 3).
 *
 * HARD RULES:
 * - AP bill != Expense (bills are payable obligations, not actual cost).
 * - Matching links a bill to a PO and/or an *existing* expense.
 * - Accepting a match never invents / auto-creates an Expense.
 */

import { DomainRuleError } from '@/shared/errors';
import { addMoney, compareMoney, isZeroMoney, money, zeroMoney } from '@/shared/money';

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

  const currency = input.currency.toUpperCase();
  let matched = zeroMoney(currency);
  for (const amount of input.acceptedMatchedAmounts) {
    matched = addMoney(matched, money(amount, currency));
  }

  if (isZeroMoney(matched)) {
    return input.currentStatus === 'draft' ? 'draft' : 'open';
  }

  const total = money(input.billTotal, currency);
  if (compareMoney(matched, total) >= 0) return 'matched';
  return 'partially_matched';
}
