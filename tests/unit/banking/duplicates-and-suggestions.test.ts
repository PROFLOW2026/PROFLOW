import { describe, expect, it } from 'vitest';
import {
  detectBankImportDuplicates,
  isDuplicateRow,
} from '@/modules/banking/domain/duplicates';
import { bankTransactionFingerprint } from '@/modules/banking/domain/fingerprint';
import { suggestBankMatches } from '@/modules/banking/domain/suggestions';
import type { BankMatchCandidate } from '@/modules/banking/domain/types';

describe('bank import duplicate detection', () => {
  it('flags within-file and existing fingerprints', () => {
    const bankAccountId = 'acc-1';
    const row = {
      date: '2026-08-01',
      amount: '100.000000',
      direction: 'credit' as const,
      description: 'Customer ACME',
      reference: 'INV-9',
    };
    const fingerprint = bankTransactionFingerprint({ bankAccountId, ...row });

    const hits = detectBankImportDuplicates({
      bankAccountId,
      rows: [
        { rowNumber: 2, ...row },
        { rowNumber: 3, ...row },
        {
          rowNumber: 4,
          date: '2026-08-02',
          amount: '50.000000',
          direction: 'debit',
          description: 'Vendor',
          reference: null,
        },
      ],
      existing: [
        {
          id: 'txn-existing',
          bankAccountId,
          fingerprint,
        },
      ],
    });

    expect(hits).toHaveLength(2);
    expect(hits.find((h) => h.rowNumber === 2)?.kind).toBe('existing');
    expect(hits.find((h) => h.rowNumber === 3)?.kind).toBe('within_file');
    expect(isDuplicateRow(hits, 4)).toBe(false);
  });
});

describe('bank match suggestions', () => {
  const baseTxn = {
    id: 'txn-1',
    organizationId: 'org-1',
    amount: '250.000000',
    currency: 'ILS',
    date: '2026-08-05',
    description: 'Payment from Acme Corp',
    reference: 'BILL-100',
    direction: 'credit' as const,
    matchStatus: 'unmatched' as const,
  };

  it('suggests billing / customer payment for incoming credits', () => {
    const candidates: BankMatchCandidate[] = [
      {
        kind: 'billing_record',
        id: 'bill-1',
        amount: '250.000000',
        currency: 'ILS',
        date: '2026-08-05',
        reference: 'BILL-100',
        counterpartyLabel: 'Acme Corp',
      },
      {
        kind: 'vendor_bill',
        id: 'vb-1',
        amount: '250.000000',
        currency: 'ILS',
        date: '2026-08-05',
        reference: 'BILL-100',
        counterpartyLabel: 'Acme Corp',
      },
    ];

    const suggestions = suggestBankMatches({
      organizationId: 'org-1',
      transaction: baseTxn,
      candidates,
      idFactory: () => 'sug-1',
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.targetKind).toBe('billing_record');
    expect(suggestions[0]!.score).toBeGreaterThanOrEqual(50);
  });

  it('suggests vendor payment / bill for outgoing debits', () => {
    const suggestions = suggestBankMatches({
      organizationId: 'org-1',
      transaction: {
        ...baseTxn,
        direction: 'debit',
        description: 'Pay Supplier Ltd',
        reference: 'VP-22',
      },
      candidates: [
        {
          kind: 'vendor_payment',
          id: 'vp-1',
          amount: '250.000000',
          currency: 'ILS',
          date: '2026-08-05',
          reference: 'VP-22',
          counterpartyLabel: 'Supplier Ltd',
          billAlreadyRecognized: true,
        },
        {
          kind: 'customer_payment',
          id: 'cp-1',
          amount: '250.000000',
          currency: 'ILS',
          date: '2026-08-05',
          reference: 'VP-22',
          counterpartyLabel: 'Supplier Ltd',
        },
      ],
      idFactory: () => 'sug-2',
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.targetKind).toBe('vendor_payment');
  });

  it('returns no suggestions for matched or ignored lines', () => {
    expect(
      suggestBankMatches({
        organizationId: 'org-1',
        transaction: { ...baseTxn, matchStatus: 'matched' },
        candidates: [
          {
            kind: 'billing_record',
            id: 'bill-1',
            amount: '250.000000',
            currency: 'ILS',
            date: '2026-08-05',
            reference: 'BILL-100',
            counterpartyLabel: null,
          },
        ],
      }),
    ).toHaveLength(0);
  });
});
