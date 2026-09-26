/**
 * The original statutory tax invoice row is marked credited only.
 * Amounts and reconciliation on that row are left untouched.
 */
export function statutoryCreditOriginalStatusPatch(): { readonly status: 'credited' } {
  return { status: 'credited' };
}

export type CreditNoteSelection =
  | { readonly ok: true; readonly creditNoteId: string }
  | { readonly ok: false; readonly error: 'missing_credit_note' | 'ambiguous_credit_note' };

/**
 * Pick the internal billing credit note a SUMIT credit document must link to.
 * An explicit id wins. Several reversing notes without an explicit id are refused.
 */
export function selectCreditNoteForStatutoryCredit(input: {
  readonly explicitCreditNoteId?: string | null;
  readonly creditNoteIds: readonly string[];
}): CreditNoteSelection {
  const explicit = input.explicitCreditNoteId?.trim();
  if (explicit) {
    return { ok: true, creditNoteId: explicit };
  }
  if (input.creditNoteIds.length === 1) {
    return { ok: true, creditNoteId: input.creditNoteIds[0]! };
  }
  if (input.creditNoteIds.length === 0) {
    return { ok: false, error: 'missing_credit_note' };
  }
  return { ok: false, error: 'ambiguous_credit_note' };
}
