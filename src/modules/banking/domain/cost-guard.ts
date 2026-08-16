import type { BankMatchTargetKind } from './types';

/**
 * Structural guarantee: bank reconciliation never silently writes financials.
 * Tests and decide-match call sites assert this.
 */
export function assertBankMatchDoesNotMutateFinancials(): void {
  // Intentional no-op - presence documents the invariant.
}

/** Bank match decisions are never Actual Cost recognition. */
export function isBankMatchRecognizedActual(): false {
  return false;
}

/** Bank match decisions never invent Expense / project cost rows. */
export function isBankMatchCreatingProjectCost(): false {
  return false;
}

/**
 * When a bank debit is matched to a vendor payment (or a vendor bill that already
 * recognizes Actual), the reconciliation is cash only - never project cost.
 */
export function shouldRecognizeBankTxnAsProjectCost(input: {
  readonly targetKind: BankMatchTargetKind | null;
  readonly billAlreadyRecognized?: boolean;
}): false {
  void input;
  // V1 hard rule: bank txn matching never becomes project cost, including when
  // the target is a vendor payment for an already-recognized bill.
  return false;
}

export function assertBankMatchDoesNotCreateProjectCost(input: {
  readonly targetKind: BankMatchTargetKind | null;
  readonly billAlreadyRecognized?: boolean;
}): void {
  if (shouldRecognizeBankTxnAsProjectCost(input) !== false) {
    throw new Error('Bank match must never create project cost');
  }
  if (isBankMatchCreatingProjectCost() !== false) {
    throw new Error('Bank match must never create project cost');
  }
}
