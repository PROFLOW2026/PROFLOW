import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { DomainRuleError } from '@/shared/errors';
import { money } from '@/shared/money';
import {
  assertPaidInstallmentsUnchanged,
  buildCashInstallmentSchedule,
  cashInstallmentFieldsForSave,
  managerialRecognitionCount,
  resolveCashInstallmentLines,
} from '@/modules/expenses/domain/cash-installment-schedule';
import {
  composeMonthCashFlow,
  type MonthExpenseCashSnapshot,
} from '@/modules/financials/domain/month-cash-flow';

const ILS = 'ILS';

function expense(partial: Partial<MonthExpenseCashSnapshot>): MonthExpenseCashSnapshot {
  return {
    id: 'exp-1',
    party: 'ספק',
    document: 'רכישה',
    grossAmount: '12000.000000',
    currency: ILS,
    expenseDate: businessDate('2026-09-15'),
    dueDate: businessDate('2026-09-15'),
    paymentTerms: null,
    installmentCount: 6,
    installmentStartDate: businessDate('2026-09-15'),
    installmentsPaidCount: 0,
    paidGrossAmount: null,
    paidAt: null,
    paymentMethod: 'credit_card',
    recognizedApMatch: false,
    voided: false,
    ...partial,
  };
}

function month(from: string, to: string, row: MonthExpenseCashSnapshot) {
  return composeMonthCashFlow({
    currency: ILS,
    from: businessDate(from),
    to: businessDate(to),
    collectionsActual: money('0', ILS),
    apPayments: [],
    apExpected: [],
    expenses: [row],
    payroll: [],
    advances: [],
  });
}

describe('expense installment purchases', () => {
  it('builds six equal monthly cash lines and puts the remainder on the last line', () => {
    const even = buildCashInstallmentSchedule({
      totalGross: money('12000', ILS),
      installmentCount: 6,
      startDate: businessDate('2026-09-15'),
    });
    expect(even.map((line) => line.dueDate)).toEqual([
      '2026-09-15',
      '2026-10-15',
      '2026-11-15',
      '2026-12-15',
      '2027-01-15',
      '2027-02-15',
    ]);
    expect(even.every((line) => line.amount.amount === money('2000', ILS).amount)).toBe(true);

    const uneven = buildCashInstallmentSchedule({
      totalGross: money('10000', ILS),
      installmentCount: 6,
      startDate: businessDate('2026-09-15'),
    });
    const last = uneven[5]!;
    const head = uneven.slice(0, 5).reduce((sum, line) => sum + Number(line.amount.amount), 0);
    expect(head + Number(last.amount.amount)).toBeCloseTo(10000, 5);
    expect(last.amount.amount).not.toBe(uneven[0]!.amount.amount);
  });

  it('accepts an edited check schedule only when the amounts match the payable total', () => {
    const checks = {
      interval: 'monthly' as const,
      lines: [
        { dueDate: '2026-09-20', amount: '4000' },
        { dueDate: '2026-10-05', amount: '5000' },
        { dueDate: '2026-11-12', amount: '3000' },
      ],
    };
    const saved = cashInstallmentFieldsForSave({
      paymentStructure: 'installments',
      cashInstallmentSchedule: checks,
      gross: money('12000', ILS),
    });
    expect(saved.replacesPaymentTerms).toBe(true);
    expect(saved.installmentCount).toBe(3);
    expect(saved.dueDate).toBe('2026-09-20');
    expect(saved.cashInstallmentSchedule?.lines[1]?.amount).toBe(money('5000', ILS).amount);

    expect(() =>
      cashInstallmentFieldsForSave({
        paymentStructure: 'installments',
        cashInstallmentSchedule: {
          interval: 'monthly',
          lines: [
            { dueDate: '2026-09-20', amount: '4000' },
            { dueDate: '2026-10-05', amount: '4000' },
          ],
        },
        gross: money('12000', ILS),
      }),
    ).toThrow(DomainRuleError);
  });

  it('keeps paid installments fixed and allows a later line to change', () => {
    const previous = resolveCashInstallmentLines({
      totalGross: money('12000', ILS),
      installmentCount: 3,
      startDate: businessDate('2026-09-15'),
      stored: {
        interval: 'monthly',
        lines: [
          { dueDate: '2026-09-15', amount: '4000' },
          { dueDate: '2026-10-15', amount: '4000' },
          { dueDate: '2026-11-15', amount: '4000' },
        ],
      },
    });
    const editedFuture = resolveCashInstallmentLines({
      totalGross: money('12000', ILS),
      installmentCount: 3,
      startDate: businessDate('2026-09-15'),
      stored: {
        interval: 'monthly',
        lines: [
          { dueDate: '2026-09-15', amount: '4000' },
          { dueDate: '2026-10-20', amount: '3000' },
          { dueDate: '2026-12-01', amount: '5000' },
        ],
      },
    });
    expect(() =>
      assertPaidInstallmentsUnchanged({
        previous,
        next: editedFuture,
        installmentsPaidCount: 1,
      }),
    ).not.toThrow();

    const rewrittenPaid = editedFuture.map((line, index) =>
      index === 0 ? { ...line, amount: money('1000', ILS) } : line,
    );
    expect(() =>
      assertPaidInstallmentsUnchanged({
        previous,
        next: rewrittenPaid,
        installmentsPaidCount: 1,
      }),
    ).toThrow(DomainRuleError);
  });

  it('does not spread recognized cost when the cash schedule is explicit', () => {
    const stored = { interval: 'monthly', lines: [{ dueDate: '2026-09-15', amount: '1' }] };
    expect(
      managerialRecognitionCount({ installmentCount: 6, cashInstallmentSchedule: stored }),
    ).toBe(1);
    expect(managerialRecognitionCount({ installmentCount: 6, cashInstallmentSchedule: null })).toBe(6);
  });

  it('puts only the due installment in that month, then moves it to paid without double counting', () => {
    const stored = {
      interval: 'monthly',
      lines: [
        { dueDate: '2026-09-15', amount: '2000.000000' },
        { dueDate: '2026-10-15', amount: '2000.000000' },
        { dueDate: '2026-11-15', amount: '2000.000000' },
        { dueDate: '2026-12-15', amount: '2000.000000' },
        { dueDate: '2027-01-15', amount: '2000.000000' },
        { dueDate: '2027-02-15', amount: '2000.000000' },
      ],
    };
    for (const method of ['credit_card', 'check'] as const) {
      const open = month(
        '2026-09-01',
        '2026-09-30',
        expense({ paymentMethod: method, cashInstallmentSchedule: stored }),
      );
      expect(open.paidActual.amount).toBe(money('0', ILS).amount);
      expect(open.expectedOutgoing.amount).toBe(money('2000', ILS).amount);
      expect(open.expectedLines).toHaveLength(1);

      const october = month(
        '2026-10-01',
        '2026-10-31',
        expense({ paymentMethod: method, cashInstallmentSchedule: stored }),
      );
      expect(october.expectedOutgoing.amount).toBe(money('2000', ILS).amount);
      expect(october.paidActual.amount).toBe(money('0', ILS).amount);
    }

    const paidSeptember = month(
      '2026-09-01',
      '2026-09-30',
      expense({
        cashInstallmentSchedule: stored,
        installmentsPaidCount: 1,
        paidGrossAmount: '2000.000000',
        paidAt: businessDate('2026-09-15'),
        paymentMethod: 'check',
      }),
    );
    expect(paidSeptember.paidActual.amount).toBe(money('2000', ILS).amount);
    expect(paidSeptember.expectedOutgoing.amount).toBe(money('0', ILS).amount);
    expect(paidSeptember.paidLines.map((line) => line.id)).not.toEqual(
      paidSeptember.expectedLines.map((line) => line.id),
    );

    const stillDueOctober = month(
      '2026-10-01',
      '2026-10-31',
      expense({
        cashInstallmentSchedule: stored,
        installmentsPaidCount: 1,
        paidGrossAmount: '2000.000000',
        paidAt: businessDate('2026-09-15'),
      }),
    );
    expect(stillDueOctober.paidActual.amount).toBe(money('0', ILS).amount);
    expect(stillDueOctober.expectedOutgoing.amount).toBe(money('2000', ILS).amount);
  });
});
