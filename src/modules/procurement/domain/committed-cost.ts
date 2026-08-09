/**
 * Procurement domain rules (Wave 3).
 * HARD RULE: CommittedCost != Expense.
 */

import { DomainRuleError } from '@/shared/errors';
import { addMoney, money, moneyEquals, zeroMoney } from '@/shared/money';

export const PURCHASE_ORDER_STATUSES = [
  'draft',
  'issued',
  'partially_received',
  'closed',
  'cancelled',
] as const;

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const COMMITTED_COST_STATUSES = [
  'open',
  'partially_consumed',
  'closed',
  'cancelled',
] as const;

export type CommittedCostStatus = (typeof COMMITTED_COST_STATUSES)[number];

/** Issuing a PO creates/updates committed cost — never posts an Expense. */
export function shouldCreateCommittedCostOnIssue(status: PurchaseOrderStatus): boolean {
  return status === 'issued' || status === 'partially_received';
}

export function isCommittedCostActualExpense(): false {
  return false;
}

/**
 * Guard for issuePurchaseOrder: committed cost is opened; Expense must not be created.
 */
export function assertIssueCreatesCommittedNotExpense(status: PurchaseOrderStatus): void {
  if (!shouldCreateCommittedCostOnIssue(status)) {
    throw new DomainRuleError(
      'Issued PO must create committed cost',
      'procurement.errors.committedRequired',
    );
  }
  if (isCommittedCostActualExpense()) {
    throw new DomainRuleError(
      'Issuing a purchase order must not create an expense',
      'procurement.errors.expenseForbidden',
    );
  }
}

/**
 * PO header committed amount must equal the sum of line totals (money helpers, not floats).
 */
export function assertCommittedAmountMatchesLines(input: {
  readonly currency: string;
  readonly committedAmount: string;
  readonly lines: readonly {
    readonly lineTotal: string;
    readonly currency: string;
  }[];
}): void {
  const currency = input.currency.toUpperCase();
  let sum = zeroMoney(currency);
  for (const line of input.lines) {
    if (line.currency.toUpperCase() !== currency) {
      throw new DomainRuleError(
        'Purchase order line currency must match the PO currency',
        'procurement.errors.currencyMismatch',
      );
    }
    sum = addMoney(sum, money(line.lineTotal, currency));
  }
  if (!moneyEquals(sum, money(input.committedAmount, currency))) {
    throw new DomainRuleError(
      'Committed amount must equal the sum of line totals',
      'procurement.errors.committedMismatch',
    );
  }
}

/**
 * Committed amounts may inform forecasts but must not be summed into
 * actual project cost / expense totals. Uses money helpers — never JS floats.
 */
export function excludeCommittedFromActualCost(input: {
  readonly actualExpenseTotal: string;
  readonly committedOpenTotal: string;
  readonly currency: string;
}): { actualCost: string; committedOnly: string } {
  const currency = input.currency.toUpperCase();
  // Touch money() so malformed amounts fail fast; no arithmetic mixing.
  const actual = money(input.actualExpenseTotal, currency);
  const committed = money(input.committedOpenTotal, currency);
  return {
    actualCost: actual.amount,
    committedOnly: committed.amount,
  };
}
