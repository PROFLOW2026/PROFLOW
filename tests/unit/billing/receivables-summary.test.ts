import { describe, expect, it } from 'vitest';
import { computeReceivablesAging } from '@/modules/billing/domain/aging';
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
    ...partial,
  };
}

describe('receivables summary', () => {
  it('sums outstanding and overdue with open/partial counts using money helpers', () => {
    const records = [
      record({
        id: 'open',
        dueDate: businessDate('2026-08-15'),
        outstandingAmount: money('100', currency),
        collectionStatus: 'open',
      }),
      record({
        id: 'partial',
        dueDate: businessDate('2026-08-20'),
        outstandingAmount: money('40', currency),
        paidAmount: money('60', currency),
        totalAmount: money('100', currency),
        collectionStatus: 'partial',
      }),
      record({
        id: 'overdue',
        dueDate: businessDate('2026-07-01'),
        outstandingAmount: money('25.50', currency),
        collectionStatus: 'overdue',
      }),
      record({
        id: 'paid',
        dueDate: businessDate('2026-07-01'),
        outstandingAmount: money('0', currency),
        paidAmount: money('10', currency),
        totalAmount: money('10', currency),
        collectionStatus: 'paid',
      }),
      record({
        id: 'void',
        dueDate: null,
        status: 'void',
        outstandingAmount: money('0', currency),
        collectionStatus: null,
      }),
    ];

    const summary = computeReceivablesSummary(records, currency, asOf);

    expect(summary.totalOutstanding.amount).toBe('165.500000');
    expect(summary.overdueTotal.amount).toBe('25.500000');
    expect(summary.openCount).toBe(1);
    expect(summary.partialPaidCount).toBe(1);
    expect(summary.overdueCount).toBe(1);
    expect(summary.retentionReleaseOutstanding).toBeNull();
  });

  it('surfaces retention_release outstanding only when present', () => {
    const withRetention = computeReceivablesSummary(
      [
        record({
          id: 'ret',
          kind: 'retention_release',
          dueDate: null,
          outstandingAmount: money('500', currency),
          collectionStatus: 'open',
        }),
      ],
      currency,
      asOf,
    );

    expect(withRetention.retentionReleaseOutstanding?.amount).toBe('500.000000');
    expect(withRetention.retentionReleaseOpenCount).toBe(1);
    expect(withRetention.totalOutstanding.amount).toBe('500.000000');
  });

  it('excludes foreign-currency open amounts from totals but counts them', () => {
    const summary = computeReceivablesSummary(
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
          collectionStatus: 'open',
        }),
      ],
      currency,
      asOf,
    );

    expect(summary.totalOutstanding.amount).toBe('10.000000');
    expect(summary.excludedForeignCurrencyCount).toBe(1);
  });
});

describe('receivables summary ↔ aging interaction', () => {
  it('aging total matches summary total for the same open outstanding set', () => {
    const openRecords = [
      record({
        id: '1',
        dueDate: businessDate('2026-08-01'),
        outstandingAmount: money('100', currency),
        collectionStatus: 'overdue',
      }),
      record({
        id: '2',
        dueDate: businessDate('2026-07-01'),
        outstandingAmount: money('50', currency),
        collectionStatus: 'overdue',
      }),
      record({
        id: '3',
        dueDate: null,
        outstandingAmount: money('25', currency),
        collectionStatus: 'open',
      }),
      record({
        id: 'credit-open',
        kind: 'credit_note',
        dueDate: null,
        // Credit notes with positive outstanding are unusual; still must use Outstanding only.
        outstandingAmount: money('0', currency),
        collectionStatus: 'paid',
      }),
    ];

    const summary = computeReceivablesSummary(openRecords, currency, asOf);
    const aging = computeReceivablesAging(
      openRecords.filter((r) => r.outstandingAmount.amount !== '0.000000'),
      currency,
      asOf,
    );

    expect(aging.totalOutstanding.amount).toBe(summary.totalOutstanding.amount);
    expect(summary.overdueTotal.amount).toBe('150.000000');
    expect(aging.buckets.find((b) => b.key === 'current')?.total.amount).toBe('25.000000');
  });

  it('void and draft never inflate summary or aging', () => {
    const records = [
      record({
        id: 'draft',
        status: 'draft',
        dueDate: null,
        outstandingAmount: money('0', currency),
        collectionStatus: null,
      }),
      record({
        id: 'void',
        status: 'void',
        dueDate: businessDate('2026-01-01'),
        outstandingAmount: money('0', currency),
        collectionStatus: null,
      }),
      record({
        id: 'live',
        dueDate: businessDate('2026-08-01'),
        outstandingAmount: money('12', currency),
        collectionStatus: 'overdue',
      }),
    ];

    const summary = computeReceivablesSummary(records, currency, asOf);
    const aging = computeReceivablesAging(
      records.filter((r) => r.outstandingAmount.amount !== '0.000000'),
      currency,
      asOf,
    );

    expect(summary.totalOutstanding.amount).toBe('12.000000');
    expect(summary.openCount + summary.partialPaidCount + summary.overdueCount).toBe(1);
    expect(aging.totalOutstanding.amount).toBe('12.000000');
  });
});
