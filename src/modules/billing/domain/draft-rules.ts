import Decimal from 'decimal.js';
import { ValidationError } from '@/shared/errors';

/** Statutory document statuses that mean a provider document was issued. */
const ISSUED_STATUTORY_STATUSES = new Set(['issued', 'allocated', 'credited']);

/**
 * Finalized records are already blocked by `assertEditable`.
 * An issued SUMIT (or other statutory) document must not be rewritten through the draft editor.
 */
export function statutoryStatusBlocksDraftEdit(status: string): boolean {
  return ISSUED_STATUTORY_STATUSES.has(status);
}

/**
 * Finalize-only date order. Draft save may store an inverted pair.
 * Comparison is on YYYY-MM-DD business dates.
 */
export function assertFinalizeDueDateOrder(
  issueDate: string,
  dueDate: string | null | undefined,
): void {
  if (!dueDate) return;
  if (dueDate >= issueDate) return;
  throw new ValidationError([
    {
      path: 'dueDate',
      message: 'Due date is before the issue date',
      messageKey: 'billing.errors.dueBeforeIssue',
    },
  ]);
}

/**
 * Warning only. Does not cap the draft and does not block save or finalize.
 * Returns false when either amount is missing or not a finite decimal.
 */
export function draftAmountExceedsContractCurrent(
  draftAmount: string | null | undefined,
  contractCurrentAmount: string | null | undefined,
): boolean {
  if (!draftAmount?.trim() || !contractCurrentAmount?.trim()) return false;
  try {
    const draft = new Decimal(draftAmount);
    const contract = new Decimal(contractCurrentAmount);
    if (!draft.isFinite() || !contract.isFinite()) return false;
    return draft.greaterThan(contract);
  } catch {
    return false;
  }
}
