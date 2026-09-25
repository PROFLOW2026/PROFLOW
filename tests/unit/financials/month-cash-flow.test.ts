import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { money, multiplyMoney } from '@/shared/money';
import {
  apPaymentDisplay,
  cashLineDisplayText,
  composeMonthCashFlow,
  documentCashTriplet,
  type MonthCashExpectedLine,
  type MonthCashPaidLine,
  type MonthExpenseCashSnapshot,
  type MonthPayrollCashSnapshot,
} from '@/modules/financials/domain/month-cash-flow';

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

describe('monthly NET / GROSS display', () => {
  it('shows stored NET as primary and stored GROSS as the cash amount for a VAT expense', () => {
    const result = compose({
      expenses: [
        expense({
          netAmount: '10000',
          taxAmount: '1800',
          grossAmount: '11800',
          paidGrossAmount: '11800',
          paidAt: businessDate('2026-09-15'),
        }),
      ],
    });
    expect(result.paidActual.amount).toBe(money('11800', ILS).amount);
    expect(result.display.paid.net.amount).toBe(money('10000', ILS).amount);
    expect(result.display.paid.gross.amount).toBe(money('11800', ILS).amount);
    expect(result.display.paid.vat.amount).toBe(money('1800', ILS).amount);
    expect(result.paidLines[0]?.display?.net.amount).toBe(money('10000', ILS).amount);
    expect(result.paidLines[0]?.display?.gross.amount).toBe(money('11800', ILS).amount);
  });

  it('keeps NET equal to GROSS when the document has no VAT', () => {
    const result = compose({
      expenses: [
        expense({
          netAmount: '10000',
          taxAmount: '0',
          grossAmount: '10000',
          paidGrossAmount: '10000',
          paidAt: businessDate('2026-09-15'),
        }),
      ],
    });
    expect(result.display.paid.net.amount).toBe(result.display.paid.gross.amount);
    expect(result.display.paid.vat.amount).toBe(money('0', ILS).amount);
    expect(result.paidActual.amount).toBe(money('10000', ILS).amount);
  });

  it('sums stored row NET and GROSS instead of applying 18 percent to the month', () => {
    const result = compose({
      expenses: [
        expense({
          id: 'vat',
          netAmount: '10000',
          taxAmount: '1800',
          grossAmount: '11800',
          paidGrossAmount: '11800',
          paidAt: businessDate('2026-09-10'),
        }),
        expense({
          id: 'exempt',
          netAmount: '10000',
          taxAmount: '0',
          grossAmount: '10000',
          paidGrossAmount: '10000',
          paidAt: businessDate('2026-09-12'),
        }),
      ],
    });
    const blanket = multiplyMoney(result.display.paid.net, '1.18');
    expect(result.display.paid.net.amount).toBe(money('20000', ILS).amount);
    expect(result.display.paid.gross.amount).toBe(money('21800', ILS).amount);
    expect(result.paidActual.amount).toBe(money('21800', ILS).amount);
    expect(result.display.paid.gross.amount).not.toBe(blanket.amount);
  });

  it('uses the document tax ratio for a partial slice, not a blanket 18 percent', () => {
    const slice = documentCashTriplet(money('5500', ILS), {
      netAmount: '10000',
      taxAmount: '1000',
      grossAmount: '11000',
    });
    expect(slice.gross.amount).toBe(money('5500', ILS).amount);
    expect(slice.net.amount).toBe(money('5000', ILS).amount);
    expect(slice.vat.amount).toBe(money('500', ILS).amount);
  });

  it('attributes only the September installment cash, split by that expense stored tax', () => {
    const result = compose({
      expenses: [
        expense({
          netAmount: '10000',
          taxAmount: '2000',
          grossAmount: '12000',
          installmentCount: 6,
          installmentStartDate: businessDate('2026-09-15'),
          dueDate: businessDate('2026-09-15'),
        }),
      ],
    });
    expect(result.expectedLines).toHaveLength(1);
    expect(result.expectedOutgoing.amount).toBe(money('2000', ILS).amount);
    expect(result.display.expected.gross.amount).toBe(money('2000', ILS).amount);
    expect(result.display.expected.net.amount).toBe(money('1666.666667', ILS).amount);
    expect(result.expectedLines[0]?.display?.vat.amount).not.toBe(money('0', ILS).amount);
  });

  it('does not invent VAT for an unapplied vendor payment', () => {
    const display = apPaymentDisplay({
      amount: money('11800', ILS),
      applications: [],
    });
    expect(display.net.amount).toBe(display.gross.amount);
    expect(display.vat.amount).toBe(money('0', ILS).amount);
  });

  it('uses the vendor bill stored NET and GROSS for an applied payment', () => {
    const display = apPaymentDisplay({
      amount: money('11800', ILS),
      applications: [
        {
          appliedAmount: '11800',
          currency: ILS,
          netAmount: '10000',
          taxAmount: '1800',
          grossAmount: '11800',
        },
      ],
    });
    expect(display.net.amount).toBe(money('10000', ILS).amount);
    expect(display.gross.amount).toBe(money('11800', ILS).amount);
    expect(display.vat.amount).toBe(money('1800', ILS).amount);
  });

  it('counts payroll by payment date and ignores an expense labeled employees', () => {
    const payroll: MonthPayrollCashSnapshot = {
      id: 'pay-mohammad',
      party: 'מוחמד נציר',
      document: '2026-02',
      expectedAmount: '8000',
      paidAmount: '8000',
      currency: ILS,
      dueDate: businessDate('2026-03-10'),
      paidAt: businessDate('2026-03-10'),
      voided: false,
    };
    const march = composeMonthCashFlow({
      currency: ILS,
      from: businessDate('2026-03-01'),
      to: businessDate('2026-03-31'),
      collectionsActual: money('0', ILS),
      apPayments: [],
      apExpected: [],
      expenses: [expense({ party: 'עובדים', document: 'עובדים', paidGrossAmount: '8000', paidAt: businessDate('2026-03-10'), grossAmount: '8000', expenseDate: businessDate('2026-03-01'), dueDate: businessDate('2026-03-10') })],
      payroll: [payroll],
      advances: [],
    });
    const february = composeMonthCashFlow({
      currency: ILS,
      from: businessDate('2026-02-01'),
      to: businessDate('2026-02-28'),
      collectionsActual: money('0', ILS),
      apPayments: [],
      apExpected: [],
      expenses: [],
      payroll: [payroll],
      advances: [],
    });
    expect(march.paidLines.map((line) => line.party)).toEqual(['עובדים', 'מוחמד נציר']);
    expect(march.paidActual.amount).toBe(money('16000', ILS).amount);
    expect(february.paidLines).toHaveLength(0);
    expect(cashLineDisplayText('11111111-1111-4111-8111-111111111111')).toBe('');
    expect(cashLineDisplayText('סאלח נציר')).toBe('סאלח נציר');
  });

  it('counts one canonical payment id once', () => {
    const line = paidAp('5000', '2026-09-02', 'same-payment');
    const result = compose({ apPayments: [line, { ...line }] });
    expect(result.paidLines).toHaveLength(1);
    expect(result.paidActual.amount).toBe(money('5000', ILS).amount);
  });

  it('includes bulk workforce cash from a structured vendor expense in the payment month', () => {
    const march = composeMonthCashFlow({
      currency: ILS,
      from: businessDate('2026-03-01'),
      to: businessDate('2026-03-31'),
      collectionsActual: money('0', ILS),
      apPayments: [],
      apExpected: [],
      expenses: [
        expense({
          id: 'bulk-workforce',
          party: 'התותחים',
          document: 'עובדים',
          grossAmount: '41276.4',
          paidGrossAmount: '41276.4',
          paidAt: businessDate('2026-03-15'),
          expenseDate: businessDate('2026-01-29'),
          dueDate: businessDate('2026-03-15'),
        }),
      ],
      payroll: [
        {
          id: 'owner-mar',
          party: 'ערן יוסף',
          document: '2026-02',
          expectedAmount: '27000',
          paidAmount: '27000',
          currency: ILS,
          dueDate: businessDate('2026-03-10'),
          paidAt: businessDate('2026-03-10'),
          voided: false,
        },
      ],
      advances: [],
    });
    expect(march.paidLines.map((line) => [line.source, line.party, line.amount.amount])).toEqual([
      ['expense', 'התותחים', '41276.400000'],
      ['payroll', 'ערן יוסף', '27000.000000'],
    ]);
    expect(march.paidActual.amount).toBe(money('68276.4', ILS).amount);
    expect(march.paidActual.amount).toBe(
      march.paidLines.reduce((sum, line) => sum + Number(line.amount.amount), 0).toFixed(6),
    );
  });

  it('puts each paid employee in the payment month and keeps the card equal to the lines', () => {
    const owner: MonthPayrollCashSnapshot = {
      id: 'owner-july',
      party: 'ערן יוסף',
      document: '2026-07',
      expectedAmount: '27000',
      paidAmount: '27000',
      currency: ILS,
      dueDate: businessDate('2026-08-10'),
      paidAt: businessDate('2026-08-10'),
      voided: false,
    };
    const worker: MonthPayrollCashSnapshot = {
      id: 'worker-august',
      party: 'פאדי מנצור',
      document: '2026-08',
      expectedAmount: '8250',
      paidAmount: '8250',
      currency: ILS,
      dueDate: businessDate('2026-09-10'),
      paidAt: businessDate('2026-09-09'),
      voided: false,
    };
    const unpaid: MonthPayrollCashSnapshot = {
      id: 'worker-open',
      party: 'סאלח נציר',
      document: '2026-08',
      expectedAmount: '5449.09',
      paidAmount: null,
      currency: ILS,
      dueDate: businessDate('2026-09-10'),
      paidAt: null,
      voided: false,
    };
    const august = composeMonthCashFlow({
      currency: ILS,
      from: businessDate('2026-08-01'),
      to: businessDate('2026-08-31'),
      collectionsActual: money('0', ILS),
      apPayments: [],
      apExpected: [],
      expenses: [expense({ party: 'עובדים', document: 'עובדים', paidGrossAmount: '1000', paidAt: businessDate('2026-08-02'), grossAmount: '1000', expenseDate: businessDate('2026-08-02'), dueDate: businessDate('2026-08-02') })],
      payroll: [owner, worker, unpaid],
      advances: [],
    });
    const september = composeMonthCashFlow({
      currency: ILS,
      from: businessDate('2026-09-01'),
      to: businessDate('2026-09-30'),
      collectionsActual: money('0', ILS),
      apPayments: [],
      apExpected: [],
      expenses: [],
      payroll: [owner, worker, unpaid],
      advances: [],
    });
    expect(august.paidLines.filter((line) => line.source === 'payroll').map((line) => line.party)).toEqual(['ערן יוסף']);
    expect(september.paidLines.map((line) => line.party)).toEqual(['פאדי מנצור']);
    expect(august.paidActual.amount).toBe(
      august.paidLines.reduce((sum, line) => sum + Number(line.amount.amount), 0).toFixed(6),
    );
    expect(september.paidActual.amount).toBe(money('8250', ILS).amount);
    expect(september.display.paid.net.amount).toBe(september.paidActual.amount);
    expect(september.display.paid.gross.amount).toBe(september.paidActual.amount);
  });
});
