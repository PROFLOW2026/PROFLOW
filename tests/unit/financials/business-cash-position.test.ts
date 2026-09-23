import { describe, expect, it } from 'vitest';
import {
  aggregateExpenseCashBySource,
  classifyExpenseCashSource,
  composeBusinessCashPosition,
} from '@/modules/financials/domain/business-cash-position';
import { money, zeroMoney } from '@/shared/money';

describe('business-cash-position', () => {
  it('classifies subcontractor expenses separately from suppliers', () => {
    expect(classifyExpenseCashSource('subcontractor')).toBe('expense_subcontractors');
    expect(classifyExpenseCashSource('materials')).toBe('expense_suppliers');
  });

  it('aggregates expense paid and outstanding without double-counting categories', () => {
    const sources = aggregateExpenseCashBySource(
      [
        {
          grossAmount: '1180',
          paidGrossAmount: '500',
          currency: 'ILS',
          categoryKey: 'materials',
        },
        {
          grossAmount: '5900',
          paidGrossAmount: '5900',
          currency: 'ILS',
          categoryKey: 'subcontractor',
        },
      ],
      'ILS',
    );

    expect(sources.expense_suppliers?.paid).toEqual(money('500', 'ILS'));
    expect(sources.expense_suppliers?.outstanding).toEqual(money('680', 'ILS'));
    expect(sources.expense_subcontractors?.paid).toEqual(money('5900', 'ILS'));
    expect(sources.expense_subcontractors?.outstanding).toEqual(zeroMoney('ILS'));
  });

  it('composes org totals across expense, AP, and payroll without mixing recognition', () => {
    const position = composeBusinessCashPosition({
      currency: 'ILS',
      expenseSources: aggregateExpenseCashBySource(
        [
          {
            grossAmount: '1000',
            paidGrossAmount: '400',
            currency: 'ILS',
            categoryKey: 'materials',
          },
        ],
        'ILS',
      ),
      apPaid: money('2000', 'ILS'),
      apOutstanding: money('800', 'ILS'),
      payrollPaid: money('15000', 'ILS'),
      payrollOutstanding: money('5000', 'ILS'),
      subcontractAdvancesPaid: null,
    });

    expect(Number(position.actualPaid?.amount)).toBe(17400);
    expect(Number(position.outstandingPayable?.amount)).toBe(6400);
    expect(Number(position.sources.ap?.paid.amount)).toBe(2000);
    expect(Number(position.sources.payroll?.outstanding.amount)).toBe(5000);
  });

  it('recognized unpaid expense increases outstanding but not conflated with AP when composed separately', () => {
    const expenseOnly = composeBusinessCashPosition({
      currency: 'ILS',
      expenseSources: aggregateExpenseCashBySource(
        [
          {
            grossAmount: '5000',
            paidGrossAmount: '0',
            currency: 'ILS',
            categoryKey: 'materials',
          },
        ],
        'ILS',
      ),
      apPaid: zeroMoney('ILS'),
      apOutstanding: zeroMoney('ILS'),
      payrollPaid: zeroMoney('ILS'),
      payrollOutstanding: zeroMoney('ILS'),
      subcontractAdvancesPaid: null,
    });

    expect(expenseOnly.actualPaid).toBeNull();
    expect(Number(expenseOnly.outstandingPayable?.amount)).toBe(5000);
  });
});
