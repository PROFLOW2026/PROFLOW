import type { ChangeOrderRecord } from './types';

export type ReverseChangeOrderBlockReason = 'is_reversal' | 'already_reversed';

/**
 * Pure eligibility for commercial CO reversal. Billing and month-close are
 * application concerns; this only encodes "cannot reverse a reversal" and
 * "cannot reverse twice".
 */
export function reverseChangeOrderBlockReason(input: {
  readonly original: Pick<ChangeOrderRecord, 'reversalOfChangeOrderId'>;
  readonly existingReversalId: string | null;
}): ReverseChangeOrderBlockReason | null {
  if (input.original.reversalOfChangeOrderId) return 'is_reversal';
  if (input.existingReversalId) return 'already_reversed';
  return null;
}
