import { describe, expect, it } from 'vitest';
import {
  aggregateExpenseCashBySource,
  classifyExpenseCashSource,
  composeBusinessCashPosition,
  recordedNetPortion,
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
    expect(sources.expense_suppliers?.paidNet).toEqual(money('500', 'ILS'));
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

  it('splits paid and outstanding by the document net and tax, not by a flat VAT rate', () => {
    expect(recordedNetPortion(money('1000', 'ILS'), money('1180', 'ILS'), money('590', 'ILS'))).toEqual(
      money('500', 'ILS'),
    );

    const sources = aggregateExpenseCashBySource(
      [
        {
          grossAmount: '1180',
          netAmount: '1000',
          paidGrossAmount: '590',
          currency: 'ILS',
          categoryKey: 'materials',
        },
        {
          grossAmount: '380',
          netAmount: '380',
          paidGrossAmount: '380',
          currency: 'ILS',
          categoryKey: 'insurance',
        },
      ],
      'ILS',
    );

    expect(sources.expense_suppliers?.paid).toEqual(money('970', 'ILS'));
    expect(sources.expense_suppliers?.paidNet).toEqual(money('880', 'ILS'));
    expect(sources.expense_suppliers?.outstanding).toEqual(money('590', 'ILS'));
    expect(sources.expense_suppliers?.outstandingNet).toEqual(money('500', 'ILS'));
  });

  it('keeps owner payroll separate from employee payroll and does not treat it as VAT', () => {
    const position = composeBusinessCashPosition({
      currency: 'ILS',
      expenseSources: {},
      apPaid: null,
      apOutstanding: null,
      payrollPaid: money('37525', 'ILS'),
      payrollOutstanding: money('18019.04', 'ILS'),
      payrollOwnerPaid: money('249000', 'ILS'),
      payrollOwnerOutstanding: money('11000', 'ILS'),
      subcontractAdvancesPaid: null,
    });

    expect(position.actualPaid).toEqual(money('286525', 'ILS'));
    expect(position.actualPaidNet).toEqual(money('286525', 'ILS'));
    expect(position.sources.payroll?.paid).toEqual(money('37525', 'ILS'));
    expect(position.sources.payroll_owner?.paid).toEqual(money('249000', 'ILS'));
    expect(position.outstandingPayableNet).toEqual(money('29019.04', 'ILS'));
  });
});
