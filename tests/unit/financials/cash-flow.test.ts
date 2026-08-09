import { describe, expect, it } from 'vitest';
import { computeIncomingCashOutlook } from '@/modules/financials/domain/cash-flow';
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

describe('incoming cash outlook', () => {
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

    expect(outlook.buckets.find((b) => b.key === 'overdue')?.expectedIn.amount).toBe('100.000000');
    expect(outlook.buckets.find((b) => b.key === 'next_7')?.expectedIn.amount).toBe('40.000000');
    expect(outlook.buckets.find((b) => b.key === 'undated')?.expectedIn.amount).toBe('10.000000');
  });
});
