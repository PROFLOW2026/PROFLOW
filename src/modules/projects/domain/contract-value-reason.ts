/**
 * Presentation mapping for contract value event reasons stored as English
 * canonical strings in the ledger. Do not rewrite historical DB truth - only
 * map known reasons to locale message keys at render time.
 */

export const CONTRACT_VALUE_REASON_ORIGINAL = 'Original contract value';

/** Canonical prefix written for approved change-order ledger reasons. */
export const CONTRACT_VALUE_REASON_CHANGE_ORDER_PREFIX = 'Change order ';

export function formatChangeOrderContractReason(reference: string): string {
  return `${CONTRACT_VALUE_REASON_CHANGE_ORDER_PREFIX}${reference}`;
}

export type ContractValueReasonPresentation =
  | { readonly key: 'originalContractValue'; readonly values?: undefined }
  | { readonly key: 'changeOrder'; readonly values: { readonly reference: string } };

/** @deprecated Prefer {@link contractValueReasonPresentation}. */
export type ContractValueReasonMessageKey = ContractValueReasonPresentation['key'];

/**
 * Map a stored ledger reason to a locale message under
 * `projects.work.contractHistory.reasons.*`. Returns null for unknown free text.
 */
export function contractValueReasonPresentation(
  reason: string | null | undefined,
): ContractValueReasonPresentation | null {
  if (!reason) return null;
  if (reason === CONTRACT_VALUE_REASON_ORIGINAL) {
    return { key: 'originalContractValue' };
  }
  if (reason.startsWith(CONTRACT_VALUE_REASON_CHANGE_ORDER_PREFIX)) {
    const reference = reason.slice(CONTRACT_VALUE_REASON_CHANGE_ORDER_PREFIX.length).trim();
    if (reference) return { key: 'changeOrder', values: { reference } };
  }
  return null;
}

/** Narrow helper kept for callers that only need the original-value key. */
export function contractValueReasonMessageKey(
  reason: string | null | undefined,
): ContractValueReasonMessageKey | null {
  return contractValueReasonPresentation(reason)?.key ?? null;
}
