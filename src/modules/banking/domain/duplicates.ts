import { bankTransactionFingerprint } from './fingerprint';
import type { BankTransaction, BankTxnDirection } from './types';

export interface BankImportRowCandidate {
  readonly rowNumber: number;
  readonly date: string;
  readonly amount: string;
  readonly direction: BankTxnDirection;
  readonly description: string;
  readonly reference: string | null;
}

export interface BankDuplicateHit {
  readonly rowNumber: number;
  readonly fingerprint: string;
  readonly kind: 'within_file' | 'existing';
  /** First conflicting row number (within file) or existing transaction id. */
  readonly conflictRef: string;
}

/**
 * Detect duplicates within an import file and against already-stored transactions
 * for the same bank account. Later within-file rows are flagged.
 */
export function detectBankImportDuplicates(input: {
  readonly bankAccountId: string;
  readonly rows: readonly BankImportRowCandidate[];
  readonly existing: readonly Pick<
    BankTransaction,
    'id' | 'fingerprint' | 'bankAccountId'
  >[];
}): readonly BankDuplicateHit[] {
  const hits: BankDuplicateHit[] = [];
  const existingByFp = new Map<string, string>();
  for (const txn of input.existing) {
    if (txn.bankAccountId !== input.bankAccountId) continue;
    if (!existingByFp.has(txn.fingerprint)) {
      existingByFp.set(txn.fingerprint, txn.id);
    }
  }

  const seenInFile = new Map<string, number>();
  for (const row of input.rows) {
    const fingerprint = bankTransactionFingerprint({
      bankAccountId: input.bankAccountId,
      date: row.date,
      amount: row.amount,
      direction: row.direction,
      description: row.description,
      reference: row.reference,
    });

    const firstRow = seenInFile.get(fingerprint);
    if (firstRow !== undefined) {
      hits.push({
        rowNumber: row.rowNumber,
        fingerprint,
        kind: 'within_file',
        conflictRef: String(firstRow),
      });
      continue;
    }
    seenInFile.set(fingerprint, row.rowNumber);

    const existingId = existingByFp.get(fingerprint);
    if (existingId) {
      hits.push({
        rowNumber: row.rowNumber,
        fingerprint,
        kind: 'existing',
        conflictRef: existingId,
      });
    }
  }

  return hits;
}

export function isDuplicateRow(
  hits: readonly BankDuplicateHit[],
  rowNumber: number,
): boolean {
  return hits.some((hit) => hit.rowNumber === rowNumber);
}
