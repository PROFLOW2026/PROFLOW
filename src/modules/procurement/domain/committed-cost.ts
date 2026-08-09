/**
 * Procurement domain rules (Wave 3).
 * HARD RULE: CommittedCost != Expense.
 */

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
 * Committed amounts may inform forecasts but must not be summed into
 * actual project cost / expense totals.
 */
export function excludeCommittedFromActualCost(input: {
  readonly actualExpenseTotal: string;
  readonly committedOpenTotal: string;
}): { actualCost: string; committedOnly: string } {
  return {
    actualCost: input.actualExpenseTotal,
    committedOnly: input.committedOpenTotal,
  };
}
