import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';
import { composeMonthCashFlow, type MonthCashExpectedLine, type MonthCashPaidLine, type MonthExpenseCashSnapshot } from '@/modules/financials/domain/month-cash-flow';

const ILS = 'ILS';
const SEP_FROM = businessDate('2026-09-01');
const SEP_TO = businessDate('2026-09-30');

function paidAp(amount: string, date: string, id = 'pay-1'): MonthCashPaidLine {
  return {
    id: `ap:${id}`,
    source: 'ap',
    party: 'ספק א',
    document: 'חשבונית 12',
    paymentDate: businessDate(date),
    amount: money(amount, ILS),
    reference: 'העברה',
  };
}

function expectedAp(
  amount: string,
  due: string,
  status = 'unpaid',
  id = 'bill-1',
): MonthCashExpectedLine {
  return {
    id: `ap:${id}`,
    source: 'ap',
    party: 'ספק א',
    document: 'חשבונית 12',
    dueDate: businessDate(due),
    paymentTerms: 'Net 30',
    remaining: money(amount, ILS),
    status,
  };
}

function expense(partial: Partial<MonthExpenseCashSnapshot> = {}): MonthExpenseCashSnapshot {
  return {
    id: 'exp-1',
    party: 'ספק ב',
    document: 'הוצאה',
    grossAmount: '100',
    currency: ILS,
    expenseDate: businessDate('2026-09-01'),
    dueDate: businessDate('2026-09-20'),
    paymentTerms: 'Net 30',
    installmentCount: 1,
    installmentStartDate: null,
    installmentsPaidCount: 0,
    paidGrossAmount: null,
    paidAt: null,
    paymentMethod: null,
    recognizedApMatch: false,
    voided: false,
    ...partial,
  };
}

function compose(
  partial: Partial<Parameters<typeof composeMonthCashFlow>[0]> = {},
) {
  return composeMonthCashFlow({
    currency: ILS,
    from: SEP_FROM,
    to: SEP_TO,
    collectionsActual: money('0', ILS),
    apPayments: [],
    apExpected: [],
    expenses: [],
    payroll: [],
    advances: [],
    ...partial,
  });
}

describe('month cash flow', () => {
  it('puts an unpaid September vendor bill in expected outgoing only', () => {
    const result = compose({ apExpected: [expectedAp('30000', '2026-09-15')] });
    expect(result.expectedOutgoing.amount).toBe(money('30000', ILS).amount);
    expect(result.paidActual.amount).toBe(money('0', ILS).amount);
    expect(result.expectedLines).toHaveLength(1);
    expect(result.paidLines).toHaveLength(0);
  });

  it('moves a September-approved payment out of expected and into paid', () => {
    const open = compose({ apExpected: [expectedAp('30000', '2026-09-15')] });
    const settled = compose({ apPayments: [paidAp('30000', '2026-09-15')] });
    expect(open.expectedLines).toHaveLength(1);
    expect(settled.expectedLines).toHaveLength(0);
    expect(settled.paidActual.amount).toBe(money('30000', ILS).amount);
    expect(settled.paidLines[0]?.paymentDate).toBe('2026-09-15');
  });

  it('splits a partial payment between paid and the remaining expected balance', () => {
    const result = compose({
      apPayments: [paidAp('40', '2026-09-10')],
      apExpected: [expectedAp('60', '2026-09-15', 'partial')],
    });
    expect(result.paidActual.amount).toBe(money('40', ILS).amount);
    expect(result.expectedOutgoing.amount).toBe(money('60', ILS).amount);
    expect(result.paidLines[0]?.id).not.toBe(result.expectedLines[0]?.id);
  });

  it('keeps Net 90 and Net 120 in the due-date month, not the bill month', () => {
    const september = compose({
      apExpected: [expectedAp('1000', '2026-04-01', 'unpaid', 'net90')],
    });
    const april = composeMonthCashFlow({
      currency: ILS,
      from: businessDate('2026-04-01'),
      to: businessDate('2026-04-30'),
      collectionsActual: money('0', ILS),
      apPayments: [],
      apExpected: [expectedAp('1000', '2026-04-01', 'unpaid', 'net90')],
      expenses: [],
      payroll: [],
      advances: [],
    });
    expect(september.expectedLines).toHaveLength(0);
    expect(april.expectedOutgoing.amount).toBe(money('1000', ILS).amount);
  });

  it('counts an automatic expense confirmation the same as a manual one', () => {
    const automatic = compose({
      expenses: [expense({ paidGrossAmount: '100', paidAt: businessDate('2026-09-20'), installmentsPaidCount: 1 })],
    });
    const manual = compose({
      expenses: [
        expense({
          id: 'exp-manual',
          paidGrossAmount: '100',
          paidAt: businessDate('2026-09-20'),
          installmentsPaidCount: 1,
          paymentMethod: 'transfer',
        }),
      ],
    });
    expect(automatic.paidActual.amount).toBe(manual.paidActual.amount);
    expect(automatic.expectedLines).toHaveLength(0);
    expect(manual.expectedLines).toHaveLength(0);
  });

  it('records a paid inventory purchase as cash out and does not invent recognized cost', () => {
    const result = compose({ apPayments: [paidAp('100000', '2026-09-02', 'stock')] });
    expect(result.paidActual.amount).toBe(money('100000', ILS).amount);
    expect(result).not.toHaveProperty('recognizedCost');
    expect(result.expectedOutgoing.amount).toBe(money('0', ILS).amount);
  });

  it('keeps an unpaid recognized bill in expected outgoing and out of paid', () => {
    const result = compose({ apExpected: [expectedAp('30000', '2026-09-30')] });
    expect(result.expectedOutgoing.amount).toBe(money('30000', ILS).amount);
    expect(result.paidLines).toHaveLength(0);
  });

  it('drops voided expenses, cancelled expectations, and payments outside the month', () => {
    const result = compose({
      expenses: [expense({ voided: true, paidGrossAmount: '100', paidAt: businessDate('2026-09-01') })],
      apPayments: [paidAp('50', '2026-10-01', 'october')],
      apExpected: [expectedAp('80', '2026-09-12', 'cancelled', 'cancelled-bill')],
    });
    expect(result.paidLines).toHaveLength(0);
    expect(result.expectedLines).toHaveLength(0);
  });

  it('computes net cash as collections minus payments actually made', () => {
    const result = compose({
      collectionsActual: money('150916.50', ILS),
      apPayments: [paidAp('83200', '2026-09-08')],
    });
    expect(result.netCash.amount).toBe(money('67716.50', ILS).amount);
    expect(result.forecastAfterRemaining.amount).toBe(result.netCash.amount);
  });

  it('subtracts remaining expected cash from the forecast without counting it as paid', () => {
    const result = compose({
      collectionsActual: money('150916.50', ILS),
      apPayments: [paidAp('83200', '2026-09-08')],
      apExpected: [expectedAp('10000', '2026-09-28')],
    });
    expect(result.forecastAfterRemaining.amount).toBe(money('57716.50', ILS).amount);
    expect(result.paidActual.amount).toBe(money('83200', ILS).amount);
  });

  it('does not count an expense that is already a recognized vendor bill', () => {
    const result = compose({
      apPayments: [paidAp('100', '2026-09-05')],
      expenses: [
        expense({
          recognizedApMatch: true,
          paidGrossAmount: '100',
          paidAt: businessDate('2026-09-05'),
        }),
      ],
    });
    expect(result.paidActual.amount).toBe(money('100', ILS).amount);
    expect(result.paidLines).toHaveLength(1);
  });
});
