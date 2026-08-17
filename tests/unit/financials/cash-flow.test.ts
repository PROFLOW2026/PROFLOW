import { describe, expect, it } from 'vitest';
import {
  buildCashFlowOutlook,
  computeCollectedActual,
  computeIncomingCashOutlook,
  defaultActualCollectionRange,
} from '@/modules/financials/domain/cash-flow';
import type { BillingRecordSummary } from '@/modules/billing/domain/types';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';

function record(
  partial: Partial<BillingRecordSummary> &
    Pick<BillingRecordSummary, 'id' | 'dueDate' | 'outstandingAmount'>,
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
    collectionStatus: 'open',
    ...partial,
  };
}

describe('incoming cash outlook (Forecast)', () => {
  it('separates overdue, near-term, and undated outstanding', () => {
    const outlook = computeIncomingCashOutlook(
      [
        record({
          id: '1',
          dueDate: businessDate('2026-08-01'),
          outstandingAmount: money('100', 'ILS'),
        }),
        record({
          id: '2',
          dueDate: businessDate('2026-08-12'),
          outstandingAmount: money('40', 'ILS'),
        }),
        record({
          id: '3',
          dueDate: null,
          outstandingAmount: money('10', 'ILS'),
        }),
      ],
      'ILS',
      businessDate('2026-08-09'),
    );

    expect(outlook.forecastBuckets.find((b) => b.key === 'overdue')?.expectedIn.amount).toBe(
      '100.000000',
    );
    expect(outlook.forecastBuckets.find((b) => b.key === 'next_7')?.expectedIn.amount).toBe(
      '40.000000',
    );
    expect(outlook.forecastBuckets.find((b) => b.key === 'undated')?.expectedIn.amount).toBe(
      '10.000000',
    );
    expect(outlook.buckets).toEqual(outlook.forecastBuckets);
  });

  it('ignores foreign-currency outstanding', () => {
    const outlook = computeIncomingCashOutlook(
      [
        record({
          id: '1',
          dueDate: businessDate('2026-08-01'),
          outstandingAmount: money('100', 'USD'),
        }),
      ],
      'ILS',
      businessDate('2026-08-09'),
    );

    expect(outlook.forecastBuckets.every((b) => b.expectedIn.amount === '0.000000')).toBe(true);
  });

  it('buckets next_30, next_60, next_90, and later distinctly', () => {
    const outlook = computeIncomingCashOutlook(
      [
        record({
          id: '1',
          dueDate: businessDate('2026-08-25'),
          outstandingAmount: money('50', 'ILS'),
        }),
        record({
          id: '2',
          dueDate: businessDate('2026-10-01'),
          outstandingAmount: money('75', 'ILS'),
        }),
        record({
          id: '3',
          dueDate: businessDate('2026-11-01'),
          outstandingAmount: money('20', 'ILS'),
        }),
        record({
          id: '4',
          dueDate: businessDate('2026-12-15'),
          outstandingAmount: money('30', 'ILS'),
        }),
      ],
      'ILS',
      businessDate('2026-08-09'),
    );

    expect(outlook.forecastBuckets.find((b) => b.key === 'next_30')?.expectedIn.amount).toBe(
      '50.000000',
    );
    expect(outlook.forecastBuckets.find((b) => b.key === 'next_60')?.expectedIn.amount).toBe(
      '75.000000',
    );
    expect(outlook.forecastBuckets.find((b) => b.key === 'next_90')?.expectedIn.amount).toBe(
      '20.000000',
    );
    expect(outlook.forecastBuckets.find((b) => b.key === 'later')?.expectedIn.amount).toBe(
      '30.000000',
    );
  });

  it('nets credit notes into undated Forecast (not ignored)', () => {
    const outlook = computeIncomingCashOutlook(
      [
        record({
          id: '1',
          dueDate: businessDate('2026-08-12'),
          outstandingAmount: money('100', 'ILS'),
        }),
        record({
          id: 'credit',
          kind: 'credit_note',
          dueDate: null,
          outstandingAmount: money('-30', 'ILS'),
          totalAmount: money('30', 'ILS'),
          collectionStatus: 'paid',
        }),
      ],
      'ILS',
      businessDate('2026-08-09'),
    );

    expect(outlook.forecastBuckets.find((b) => b.key === 'next_7')?.expectedIn.amount).toBe(
      '100.000000',
    );
    expect(outlook.forecastBuckets.find((b) => b.key === 'undated')?.expectedIn.amount).toBe(
      '-30.000000',
    );
  });
});

describe('collected Actual (Paid in range)', () => {
  it('sums recorded payments inside the range only', () => {
    const actual = computeCollectedActual(
      [
        {
          amount: money('20', 'ILS'),
          paymentDate: businessDate('2026-08-01'),
          status: 'recorded',
        },
        {
          amount: money('5', 'ILS'),
          paymentDate: businessDate('2026-07-31'),
          status: 'recorded',
        },
        {
          amount: money('8', 'ILS'),
          paymentDate: businessDate('2026-08-09'),
          status: 'recorded',
        },
        {
          amount: money('3', 'ILS'),
          paymentDate: businessDate('2026-08-05'),
          status: 'void',
        },
        {
          amount: money('99', 'USD'),
          paymentDate: businessDate('2026-08-05'),
          status: 'recorded',
        },
      ],
      'ILS',
      businessDate('2026-08-01'),
      businessDate('2026-08-09'),
    );

    expect(actual.kind).toBe('actual');
    expect(actual.collected.amount).toBe('28.000000');
    expect(actual.count).toBe(2);
  });

  it('defaults Actual range to month-to-date', () => {
    expect(defaultActualCollectionRange(businessDate('2026-08-09'))).toEqual({
      rangeStart: businessDate('2026-08-01'),
      rangeEnd: businessDate('2026-08-09'),
    });
  });
});

describe('buildCashFlowOutlook', () => {
  it('keeps Actual and Forecast separate and discloses missing outgoing', () => {
    const view = buildCashFlowOutlook({
      currency: 'ILS',
      asOf: businessDate('2026-08-09'),
      outstandingRecords: [
        record({
          id: '1',
          dueDate: null,
          outstandingAmount: money('10', 'ILS'),
        }),
      ],
      payments: [
        {
          amount: money('15', 'ILS'),
          paymentDate: businessDate('2026-08-03'),
          status: 'recorded',
        },
      ],
    });

    expect(view.actual.collected.amount).toBe('15.000000');
    expect(view.forecastBuckets.find((b) => b.key === 'undated')?.expectedIn.amount).toBe(
      '10.000000',
    );
    expect(view.outgoing.available).toBe(false);
    if (view.outgoing.available) throw new Error('expected outgoing unavailable');
    expect(view.outgoing.disclosureKey).toBe('no_ap_due_dates');
    expect(view.note).toContain('Actual');
    expect(view.note).toContain('Forecast');
    expect(view.note).toMatch(/no open AP bills/i);
    expect(view.note).toMatch(/AP invoices are not invented/i);
  });

  it('forecasts outgoing from open AP bills without treating them as Expense', () => {
    const view = buildCashFlowOutlook({
      currency: 'ILS',
      asOf: businessDate('2026-08-09'),
      outstandingRecords: [],
      payments: [],
      openApBills: [
        {
          status: 'open',
          dueDate: businessDate('2026-08-12'),
          totalAmount: money('100', 'ILS'),
        },
        {
          status: 'partially_matched',
          dueDate: businessDate('2026-09-01'),
          totalAmount: money('50', 'ILS'),
        },
        {
          status: 'paid',
          dueDate: businessDate('2026-08-10'),
          totalAmount: money('999', 'ILS'),
        },
      ],
    });

    expect(view.outgoing.available).toBe(true);
    if (!view.outgoing.available) return;
    expect(view.outgoing.forecastBuckets.find((b) => b.key === 'next_7')?.expectedOut.amount).toBe(
      '100.000000',
    );
    expect(view.outgoing.forecastBuckets.find((b) => b.key === 'next_30')?.expectedOut.amount).toBe(
      '50.000000',
    );
    expect(
      view.outgoing.forecastBuckets.reduce((sum, b) => sum + b.count, 0),
    ).toBe(2);
    expect(view.note).toMatch(/AP bills/i);
    expect(view.note).toMatch(/Not Expense actual/i);
  });

  it('includes matched bills when cash outstanding remains after vendor payments', () => {
    const view = buildCashFlowOutlook({
      currency: 'ILS',
      asOf: businessDate('2026-08-09'),
      outstandingRecords: [],
      payments: [],
      openApBills: [
        {
          status: 'matched',
          dueDate: businessDate('2026-08-11'),
          // Caller supplies cash outstanding (bill − active applications), not PO remainder.
          totalAmount: money('42000', 'ILS'),
        },
        {
          status: 'matched',
          dueDate: businessDate('2026-08-12'),
          totalAmount: money('0', 'ILS'),
        },
      ],
    });

    expect(view.outgoing.available).toBe(true);
    if (!view.outgoing.available) return;
    expect(view.outgoing.forecastBuckets.find((b) => b.key === 'next_7')?.expectedOut.amount).toBe(
      '42000.000000',
    );
    expect(view.outgoing.forecastBuckets.reduce((sum, b) => sum + b.count, 0)).toBe(1);
    expect(view.note).toMatch(/vendor payments|cash outstanding/i);
  });
});
