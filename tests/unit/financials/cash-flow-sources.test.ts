import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { FORECAST_V2_NOTE } from '@/modules/financials/domain/cash-flow-forecast';
import {
  openCommitmentCashItems,
  operatingExpenseCashItems,
  payrollObligationCashItems,
} from '@/modules/financials/domain/cash-flow-sources';

const today = businessDate('2026-09-01');

describe('cash forecast extra sources', () => {
  it('labels the forecast as cash, not profit', () => {
    expect(FORECAST_V2_NOTE.startsWith('Cash forecast, not profit.')).toBe(true);
  });

  it('includes remaining operating-expense cash installments and skips a paid expense', () => {
    const items = operatingExpenseCashItems(
      [
        {
          id: 'exp-open',
          description: 'Office rent',
          projectId: null,
          grossAmount: '200.000000',
          currency: 'ILS',
          expenseDate: businessDate('2026-09-01'),
          dueDate: businessDate('2026-09-10'),
          installmentCount: 2,
          installmentStartDate: businessDate('2026-09-10'),
          installmentsPaidCount: 0,
          paidGrossAmount: '0',
          paymentStatus: 'upcoming',
          paidAt: null,
        },
        {
          id: 'exp-paid',
          description: 'Already paid',
          projectId: null,
          grossAmount: '50.000000',
          currency: 'ILS',
          expenseDate: businessDate('2026-08-01'),
          dueDate: businessDate('2026-08-10'),
          installmentCount: 1,
          installmentStartDate: null,
          installmentsPaidCount: 1,
          paidGrossAmount: '50.000000',
          paymentStatus: 'paid',
          paidAt: businessDate('2026-08-10'),
        },
      ],
      'ILS',
      today,
    );

    expect(items.map((item) => item.id)).toEqual([
      'expense:exp-open:inst-0',
      'expense:exp-open:inst-1',
    ]);
    expect(items.every((item) => item.sourceType === 'operating_expense')).toBe(true);
    expect(items.every((item) => item.direction === 'out')).toBe(true);
    expect(items[0]?.amount.amount).toBe('100.000000');
    expect(items[1]?.dueDate).toBe('2026-10-10');
  });

  it('includes unpaid payroll obligations as cash out', () => {
    const items = payrollObligationCashItems(
      [
        {
          id: 'pay-1',
          employeeId: 'emp-1',
          employeeName: 'Dana',
          yearMonth: '2026-09',
          expectedAmount: '12000.000000',
          currency: 'ILS',
          dueDate: businessDate('2026-10-10'),
        },
      ],
      'ILS',
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'payroll:pay-1',
      href: '/workforce/employees/emp-1',
      sourceType: 'payroll_obligation',
      direction: 'out',
      dueDate: '2026-10-10',
    });
  });

  it('keeps open commitments undated', () => {
    const items = openCommitmentCashItems(
      [
        {
          id: 'cc-1',
          purchaseOrderId: 'po-1',
          reference: 'PO-9',
          projectId: 'proj-1',
          amount: '500.000000',
          currency: 'ILS',
        },
      ],
      'ILS',
    );

    expect(items[0]).toMatchObject({
      sourceType: 'commitment',
      dueDate: null,
      certainty: 'uncertain',
      direction: 'out',
      href: '/procurement/po-1',
    });
  });
});
