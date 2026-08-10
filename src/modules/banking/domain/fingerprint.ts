import type { BankTxnDirection } from './types';

/** Normalize description for fingerprint / fuzzy compare. */
export function normalizeBankDescription(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, '');
}

export function normalizeBankReference(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Stable duplicate fingerprint for a bank line within an account.
 * Same date + amount + direction + reference + normalized description → same key.
 */
export function bankTransactionFingerprint(input: {
  readonly bankAccountId: string;
  readonly date: string;
  readonly amount: string;
  readonly direction: BankTxnDirection;
  readonly description: string;
  readonly reference?: string | null;
}): string {
  const parts = [
    input.bankAccountId,
    input.date.trim(),
    input.amount.trim(),
    input.direction,
    normalizeBankReference(input.reference),
    normalizeBankDescription(input.description),
  ];
  return parts.join('|');
}
