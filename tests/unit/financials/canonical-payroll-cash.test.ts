import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import {
  splitPayrollCashByClass,
  sumPayrollSnapshotsOutstanding,
  sumPayrollSnapshotsPaid,
} from '@/modules/financials/application/canonical-payroll-cash';
import type { MonthPayrollCashSnapshot } from '@/modules/financials/domain/month-cash-flow';

const ILS = 'ILS';

function snapshot(
  partial: Partial<MonthPayrollCashSnapshot> & Pick<MonthPayrollCashSnapshot, 'id'>,
): MonthPayrollCashSnapshot {
  return {
    party: 'עובד',
    document: '2026-01',
    expectedAmount: '1000',
    paidAmount: '1000',
    currency: ILS,
    dueDate: businessDate('2026-02-10'),
    paidAt: businessDate('2026-02-10'),
    voided: false,
    ...partial,
  };
}

describe('canonical payroll cash sums', () => {
  it('sums owner actual paid rows without double-counting replaced payment rows', () => {
    const total = sumPayrollSnapshotsPaid(
      [
        snapshot({
          id: 'owner-actual:1',
          employeeId: 'emp-1',
          payrollPeriod: '2026-01',
          paidAmount: '8205',
          paidAt: businessDate('2026-02-10'),
        }),
      ],
      ILS,
    );
    expect(Number(total.amount)).toBe(8205);
  });

  it('filters paid rows to the requested date range', () => {
    const total = sumPayrollSnapshotsPaid(
      [
        snapshot({
          id: 'pay-1',
          paidAmount: '1000',
          paidAt: businessDate('2026-02-10'),
        }),
        snapshot({
          id: 'pay-2',
          paidAmount: '2000',
          paidAt: businessDate('2026-03-10'),
        }),
      ],
      ILS,
      { from: businessDate('2026-02-01'), to: businessDate('2026-02-28') },
    );
    expect(Number(total.amount)).toBe(1000);
  });

  it('sums outstanding only from unpaid merged rows', () => {
    const total = sumPayrollSnapshotsOutstanding(
      [
        snapshot({
          id: 'pay-open',
          paidAmount: null,
          paidAt: null,
          expectedAmount: '5000',
        }),
        snapshot({
          id: 'owner-actual:paid',
          paidAmount: '8205',
          paidAt: businessDate('2026-02-10'),
          expectedAmount: '8205',
        }),
      ],
      ILS,
    );
    expect(Number(total.amount)).toBe(5000);
  });

  it('splits owner payments from employee payments without using verified month cost', () => {
    const split = splitPayrollCashByClass(
      [
        snapshot({
          id: 'owner-pay',
          compensationClass: 'owner_manager',
          paidAmount: '33000',
          paidAt: businessDate('2026-10-11'),
        }),
        snapshot({
          id: 'employee-pay',
          compensationClass: 'standard',
          paidAmount: '7150',
          paidAt: businessDate('2026-10-11'),
        }),
        snapshot({
          id: 'employee-open',
          compensationClass: 'standard',
          paidAmount: null,
          paidAt: null,
          expectedAmount: '8205',
        }),
      ],
      ILS,
    );
    expect(Number(split.ownerPaid.amount)).toBe(33000);
    expect(Number(split.employeePaid.amount)).toBe(7150);
    expect(Number(split.employeeOutstanding.amount)).toBe(8205);
    expect(Number(split.ownerOutstanding.amount)).toBe(0);
  });
});
