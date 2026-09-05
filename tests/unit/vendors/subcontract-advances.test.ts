import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import {
  computeAdvanceOutstandingBalance,
  foldAdvanceCashIntoPaid,
  type SubcontractAdvanceRecord,
} from '@/modules/vendors/domain/subcontract-advances';

function advance(
  partial: Partial<SubcontractAdvanceRecord> &
    Pick<SubcontractAdvanceRecord, 'amount' | 'status' | 'appliedAmount'>,
): SubcontractAdvanceRecord {
  return {
    id: partial.id ?? 'adv-1',
    organizationId: 'org',
    subcontractAgreementId: 'agr',
    projectId: 'prj',
    currency: 'ILS',
    paidDate: '2026-09-01',
    notes: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    archivedAt: null,
    refundedAmount: partial.refundedAmount ?? '0',
    ...partial,
  };
}

describe('subcontract advances — cash ≠ Actual', () => {
  it('outstanding is sum(paid) − sum(applied)', () => {
    const position = computeAdvanceOutstandingBalance(
      [
        advance({ amount: '10000', appliedAmount: '2500', status: 'paid' }),
        advance({ amount: '4000', appliedAmount: '4000', status: 'fully_applied' }),
      ],
      'ILS',
    );

    expect(position.paid).toBe(money('14000', 'ILS').amount);
    expect(position.applied).toBe(money('6500', 'ILS').amount);
    expect(position.outstanding).toBe(money('7500', 'ILS').amount);
  });

  it('recorded, refunded, and voided do not count as cash paid', () => {
    const position = computeAdvanceOutstandingBalance(
      [
        advance({ amount: '1000', appliedAmount: '0', status: 'recorded' }),
        advance({ amount: '2000', appliedAmount: '0', status: 'fully_refunded' }),
        advance({ amount: '3000', appliedAmount: '0', status: 'voided' }),
        advance({ amount: '5000', appliedAmount: '1000', status: 'paid' }),
      ],
      'ILS',
    );

    expect(position.paid).toBe(money('5000', 'ILS').amount);
    expect(position.applied).toBe(money('1000', 'ILS').amount);
    expect(position.outstanding).toBe(money('4000', 'ILS').amount);
  });

  it('folds advance cash into Paid without changing a separate Actual figure', () => {
    const recognizedActual = money('8000', 'ILS');
    const apPaid = money('2000', 'ILS');
    const advancePaid = money('3000', 'ILS');
    const cashPaid = foldAdvanceCashIntoPaid(apPaid, advancePaid);

    expect(cashPaid.amount).toBe(money('5000', 'ILS').amount);
    expect(recognizedActual.amount).toBe(money('8000', 'ILS').amount);
  });
});
