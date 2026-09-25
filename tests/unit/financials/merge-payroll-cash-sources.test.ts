import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { mergePayrollCashSources } from '@/modules/financials/application/merge-payroll-cash-sources';
import type { MonthPayrollCashSnapshot } from '@/modules/financials/domain/month-cash-flow';

const ILS = 'ILS';

function snapshot(
  partial: Partial<MonthPayrollCashSnapshot> & Pick<MonthPayrollCashSnapshot, 'id'>,
): MonthPayrollCashSnapshot {
  return {
    party: 'מוחמד נציר',
    document: '2026-01',
    expectedAmount: '8205',
    paidAmount: '8205',
    currency: ILS,
    dueDate: businessDate('2026-02-10'),
    paidAt: businessDate('2026-02-10'),
    voided: false,
    ...partial,
  };
}

describe('mergePayrollCashSources', () => {
  it('prefers owner actual over payment confirmation for the same employee-month', () => {
    const ownerActual = [
      snapshot({
        id: 'owner-actual:emc-1',
        employeeId: 'emp-mohammad',
        payrollPeriod: '2026-01',
        paidAmount: '8205',
      }),
    ];
    const paymentConfirmed = [
      snapshot({
        id: 'pay-voided',
        employeeId: 'emp-mohammad',
        payrollPeriod: '2026-01',
        paidAmount: '8250',
      }),
    ];

    const merged = mergePayrollCashSources({ ownerActual, paymentConfirmed });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('owner-actual:emc-1');
    expect(merged[0]?.paidAmount).toBe('8205');
  });

  it('keeps payment confirmation when no owner actual exists', () => {
    const merged = mergePayrollCashSources({
      ownerActual: [],
      paymentConfirmed: [
        snapshot({
          id: 'pay-eran',
          employeeId: 'emp-eran',
          payrollPeriod: '2026-01',
          party: 'ערן יוסף',
          paidAmount: '27000',
        }),
      ],
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('pay-eran');
  });
});
