import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { FORECAST_V2_NOTE } from '@/modules/financials/domain/cash-flow-forecast';
import {
  openCommitmentCashItems,
  operatingExpenseCashItems,
  payrollObligationCashItems,
} from '@/modules/financials/domain/cash-flow-sources';
import {
  expenseApMatchedGrossDeduction,
  recurringDraftCashForecastBlocked,
} from '@/modules/financials/domain/expense-ap-cash';
import { money } from '@/shared/money';

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

  it('keeps open commitments undated when expected cash date is null', () => {
    const items = openCommitmentCashItems(
      [
        {
          id: 'cc-1',
          purchaseOrderId: 'po-1',
          reference: 'PO-9',
          projectId: 'proj-1',
          amount: '500.000000',
          currency: 'ILS',
          expectedCashDate: null,
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

  it('keeps expense cash remainder when only part of the expense is AP-matched (V09-006)', () => {
    const grossDoc = {
      grossAmount: '11800',
      netAmount: '10000',
      taxAmount: '1800',
      currency: 'ILS',
    };
    const matchedGross = expenseApMatchedGrossDeduction('6000', grossDoc);
    expect(matchedGross.amount).toBe(money('7080', 'ILS').amount);

    const items = operatingExpenseCashItems(
      [
        {
          id: 'exp-partial-ap',
          description: 'Partial AP match',
          projectId: null,
          grossAmount: '11800',
          netAmount: '10000',
          taxAmount: '1800',
          acceptedApMatchedNetAmount: '6000',
          currency: 'ILS',
          expenseDate: businessDate('2026-09-01'),
          dueDate: businessDate('2026-09-15'),
          installmentCount: 1,
          installmentStartDate: null,
          installmentsPaidCount: 0,
          paidGrossAmount: '0',
          paymentStatus: 'upcoming',
          paidAt: null,
        },
      ],
      'ILS',
      today,
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.amount.amount).toBe(money('4720', 'ILS').amount);
    expect(items[0]?.sourceType).toBe('operating_expense');
  });

  it('drops expense cash when AP match covers the full expense gross', () => {
    const items = operatingExpenseCashItems(
      [
        {
          id: 'exp-full-ap',
          description: 'Fully matched',
          projectId: null,
          grossAmount: '1000',
          netAmount: '1000',
          taxAmount: '0',
          acceptedApMatchedNetAmount: '1000',
          currency: 'ILS',
          expenseDate: businessDate('2026-09-01'),
          dueDate: businessDate('2026-09-15'),
          installmentCount: 1,
          installmentStartDate: null,
          installmentsPaidCount: 0,
          paidGrossAmount: '0',
          paymentStatus: 'upcoming',
          paidAt: null,
        },
      ],
      'ILS',
      today,
    );
    expect(items).toHaveLength(0);
  });

  it('hides open commitments in a month already settled by a paid recurring occurrence', () => {
    const paidByProject = new Map<string, Set<string>>([
      ['proj-1', new Set(['2026-09'])],
    ]);
    const items = openCommitmentCashItems(
      [
        {
          id: 'cc-paid-rec',
          purchaseOrderId: 'po-3',
          reference: 'PO-rent',
          projectId: 'proj-1',
          amount: '5000.000000',
          currency: 'ILS',
          expectedCashDate: businessDate('2026-09-10'),
        },
        {
          id: 'cc-next',
          purchaseOrderId: 'po-4',
          reference: 'PO-next',
          projectId: 'proj-1',
          amount: '5000.000000',
          currency: 'ILS',
          expectedCashDate: businessDate('2026-10-10'),
        },
      ],
      'ILS',
      { paidRecurringMonthsByProjectId: paidByProject },
    );
    expect(items.map((item) => item.id)).toEqual(['commitment:cc-next']);
  });

  it('blocks recurring draft forecast for a month with a paid occurrence', () => {
    const paid = new Map<string, Set<string>>([['draft-1', new Set(['2026-09'])]]);
    expect(recurringDraftCashForecastBlocked('draft-1', '2026-09-15', paid)).toBe(true);
    expect(recurringDraftCashForecastBlocked('draft-1', '2026-10-15', paid)).toBe(false);
  });

  it('uses the PO expected cash date and expected certainty, not an invented order date', () => {
    const items = openCommitmentCashItems(
      [
        {
          id: 'cc-2',
          purchaseOrderId: 'po-2',
          reference: 'PO-10',
          projectId: 'proj-1',
          amount: '800.000000',
          currency: 'ILS',
          expectedCashDate: businessDate('2026-09-20'),
        },
      ],
      'ILS',
    );

    expect(items[0]).toMatchObject({
      sourceType: 'commitment',
      dueDate: '2026-09-20',
      certainty: 'expected',
      direction: 'out',
    });
  });
});
