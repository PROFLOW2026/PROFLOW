import { describe, expect, it } from 'vitest';
import { computeClientReceivablesSnapshot } from '@/modules/billing/domain/client-receivables';
import { computeReceivablesSummary } from '@/modules/billing/domain/receivables-summary';
import type { BillingRecordSummary } from '@/modules/billing/domain/types';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';

const asOf = businessDate('2026-08-09');
const currency = 'ILS';

function record(
  partial: Partial<BillingRecordSummary> &
    Pick<BillingRecordSummary, 'id' | 'dueDate' | 'outstandingAmount' | 'collectionStatus'>,
): BillingRecordSummary {
  return {
    projectId: null,
    projectName: null,
    reference: null,
    issueDate: businessDate('2026-01-01'),
    status: 'finalized',
    kind: 'invoice',
    totalAmount: partial.outstandingAmount,
    paidAmount: money('0', partial.outstandingAmount.currency),
    retentionHeldRemaining: money('0', partial.outstandingAmount.currency),
    ...partial,
  };
}

describe('computeClientReceivablesSnapshot', () => {
  it('reuses outstanding + receivables helpers for invoiced, paid, outstanding, overdue', () => {
    const records = [
      record({
        id: 'open',
        dueDate: businessDate('2026-08-15'),
        totalAmount: money('100', currency),
        paidAmount: money('0', currency),
        outstandingAmount: money('100', currency),
        collectionStatus: 'open',
      }),
      record({
        id: 'partial',
        dueDate: businessDate('2026-08-20'),
        totalAmount: money('100', currency),
        paidAmount: money('60', currency),
        outstandingAmount: money('40', currency),
        collectionStatus: 'partial',
      }),
      record({
        id: 'overdue',
        dueDate: businessDate('2026-07-01'),
        totalAmount: money('25.50', currency),
        paidAmount: money('0', currency),
        outstandingAmount: money('25.50', currency),
        collectionStatus: 'overdue',
      }),
      record({
        id: 'paid',
        dueDate: businessDate('2026-07-01'),
        totalAmount: money('10', currency),
        paidAmount: money('10', currency),
        outstandingAmount: money('0', currency),
        collectionStatus: 'paid',
      }),
    ];

    const snapshot = computeClientReceivablesSnapshot(records, currency, asOf);
    const receivables = computeReceivablesSummary(records, currency, asOf);

    expect(snapshot.invoiced.amount).toBe('235.500000');
    expect(snapshot.paid.amount).toBe('70.000000');
    expect(snapshot.outstanding.amount).toBe(receivables.totalOutstanding.amount);
    expect(snapshot.overdue.amount).toBe(receivables.overdueTotal.amount);
    expect(snapshot.overdueCount).toBe(1);
    expect(snapshot.heldRetention).toBeNull();
  });

  it('excludes draft and void from finalized billing totals', () => {
    const records = [
      record({
        id: 'live',
        dueDate: null,
        totalAmount: money('80', currency),
        outstandingAmount: money('80', currency),
        collectionStatus: 'open',
      }),
      record({
        id: 'draft',
        status: 'draft',
        dueDate: null,
        totalAmount: money('999', currency),
        outstandingAmount: money('0', currency),
        collectionStatus: null,
      }),
      record({
        id: 'void',
        status: 'void',
        dueDate: null,
        totalAmount: money('500', currency),
        outstandingAmount: money('0', currency),
        collectionStatus: null,
      }),
    ];

    const snapshot = computeClientReceivablesSnapshot(records, currency, asOf);
    expect(snapshot.invoiced.amount).toBe('80.000000');
    expect(snapshot.outstanding.amount).toBe('80.000000');
  });

  it('nets credit notes into invoiced without treating them as revenue', () => {
    const records = [
      record({
        id: 'inv',
        dueDate: businessDate('2026-08-15'),
        totalAmount: money('1000', currency),
        outstandingAmount: money('1000', currency),
        collectionStatus: 'open',
      }),
      record({
        id: 'credit',
        kind: 'credit_note',
        dueDate: null,
        totalAmount: money('200', currency),
        paidAmount: money('0', currency),
        outstandingAmount: money('-200', currency),
        collectionStatus: 'paid',
      }),
    ];

    const snapshot = computeClientReceivablesSnapshot(records, currency, asOf);
    expect(snapshot.invoiced.amount).toBe('800.000000');
    expect(snapshot.outstanding.amount).toBe('800.000000');
  });

  it('surfaces held retention only when finalized invoices still hold a positive remainder', () => {
    const withHeld = computeClientReceivablesSnapshot(
      [
        record({
          id: 'held',
          dueDate: null,
          totalAmount: money('1000', currency),
          paidAmount: money('0', currency),
          outstandingAmount: money('900', currency),
          retentionHeldRemaining: money('100', currency),
          collectionStatus: 'open',
        }),
      ],
      currency,
      asOf,
    );
    expect(withHeld.heldRetention?.amount).toBe('100.000000');
    expect(withHeld.outstanding.amount).toBe('900.000000');
    expect(withHeld.invoiced.amount).toBe('1000.000000');

    const draftHeld = computeClientReceivablesSnapshot(
      [
        record({
          id: 'draft-held',
          status: 'draft',
          dueDate: null,
          totalAmount: money('1000', currency),
          outstandingAmount: money('0', currency),
          retentionHeldRemaining: money('100', currency),
          collectionStatus: null,
        }),
      ],
      currency,
      asOf,
    );
    expect(draftHeld.heldRetention).toBeNull();
    expect(draftHeld.invoiced.amount).toBe('0.000000');
  });

  it('excludes foreign-currency records from totals and counts them', () => {
    const snapshot = computeClientReceivablesSnapshot(
      [
        record({
          id: 'ils',
          dueDate: null,
          outstandingAmount: money('10', currency),
          collectionStatus: 'open',
        }),
        record({
          id: 'usd',
          dueDate: null,
          outstandingAmount: money('99', 'USD'),
          totalAmount: money('99', 'USD'),
          paidAmount: money('0', 'USD'),
          collectionStatus: 'open',
        }),
      ],
      currency,
      asOf,
    );

    expect(snapshot.invoiced.amount).toBe('10.000000');
    expect(snapshot.outstanding.amount).toBe('10.000000');
    expect(snapshot.excludedForeignCurrencyCount).toBe(1);
  });
});
