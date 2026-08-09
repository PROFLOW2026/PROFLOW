import { describe, expect, it } from 'vitest';
import { computeReceivablesAging } from '@/modules/billing/domain/aging';
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

describe('receivables aging', () => {
  it('buckets outstanding by days past due without treating VAT as revenue', () => {
    const aging = computeReceivablesAging(
      [
        record({
          id: '1',
          dueDate: businessDate('2026-08-01'),
          outstandingAmount: money('100', 'ILS'),
        }),
        record({
          id: '2',
          dueDate: businessDate('2026-07-01'),
          outstandingAmount: money('50', 'ILS'),
        }),
        record({
          id: '3',
          dueDate: null,
          outstandingAmount: money('25', 'ILS'),
        }),
      ],
      'ILS',
      businessDate('2026-08-09'),
    );

    expect(aging.buckets.find((b) => b.key === 'current')?.total.amount).toBe('25.000000');
    expect(aging.buckets.find((b) => b.key === 'days_1_30')?.total.amount).toBe('100.000000');
    expect(aging.buckets.find((b) => b.key === 'days_31_60')?.total.amount).toBe('50.000000');
    expect(aging.totalOutstanding.amount).toBe('175.000000');
  });
});
