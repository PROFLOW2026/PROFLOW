import { describe, expect, it } from 'vitest';
import { finalizeBillingSummariesForListFilter } from '@/modules/billing/domain/billing-list-filter';
import type { BillingRecordSummary } from '@/modules/billing/domain/types';
import { money } from '@/shared/money';

function summary(input: {
  id: string;
  reference: string;
  issueDate: string;
  dueDate: string;
  collectionStatus: BillingRecordSummary['collectionStatus'];
}): BillingRecordSummary {
  const currency = 'ILS';
  const zero = money('0', currency);
  return {
    id: input.id,
    projectId: 'proj-1',
    projectName: 'Brandeis 6',
    contractId: null,
    contractName: null,
    clientId: 'client-1',
    clientName: 'Client',
    reference: input.reference,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    status: 'finalized',
    kind: 'invoice',
    totalAmount: money('8850', currency),
    subtotalAmount: money('7500', currency),
    taxAmount: money('1350', currency),
    paidAmount: zero,
    paidGrossAmount: zero,
    outstandingAmount: money('7500', currency),
    outstandingGrossAmount: money('8850', currency),
    retentionAmount: zero,
    retentionHeldRemaining: zero,
    collectionStatus: input.collectionStatus,
  };
}

describe('finalizeBillingSummariesForListFilter', () => {
  it('includes overdue records that are not among the newest by issue date', () => {
    const newerPaid = Array.from({ length: 14 }, (_, index) =>
      summary({
        id: `new-${index}`,
        reference: `00${20 + index}`,
        issueDate: '2026-03-01',
        dueDate: '2026-05-01',
        collectionStatus: 'paid',
      }),
    );
    const overdue0015 = summary({
      id: 'br-0015',
      reference: '0015',
      issueDate: '2026-02-15',
      dueDate: '2026-04-01',
      collectionStatus: 'overdue',
    });
    const pool = [...newerPaid, overdue0015];

    const result = finalizeBillingSummariesForListFilter(pool, 'overdue', 15);

    expect(result.map((row) => row.reference)).toEqual(['0015']);
  });

  it('orders overdue by due date ascending before cap', () => {
    const rows = [
      summary({
        id: 'b',
        reference: '0018',
        issueDate: '2026-03-20',
        dueDate: '2026-04-20',
        collectionStatus: 'overdue',
      }),
      summary({
        id: 'a',
        reference: '0015',
        issueDate: '2026-02-15',
        dueDate: '2026-04-01',
        collectionStatus: 'overdue',
      }),
    ];

    const result = finalizeBillingSummariesForListFilter(rows, 'overdue', 15);

    expect(result.map((row) => row.reference)).toEqual(['0015', '0018']);
  });
});
