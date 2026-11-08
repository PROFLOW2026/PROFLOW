import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { money, splitMoneyEvenly, sumMoney, type MoneyValue } from '@/shared/money';
import type { InstallmentPaymentSlice } from '@/modules/expenses/domain/expense-installment-payment-evidence';
import {
  recognizedExpenseNetInYearMonth,
  type ExpensePaymentRecognitionFields,
} from '@/modules/expenses/domain/installment-payment-recognition';

const ILS = 'ILS';

function verifiedLine(
  index: number,
  dueDate: string,
  paidAt: string,
  gross = '236.000000',
): InstallmentPaymentSlice {
  return {
    installmentIndex: index,
    dueDate: businessDate(dueDate),
    actualPaidAt: businessDate(paidAt),
    grossPaid: money(gross, ILS),
    verification: 'verified',
    source: 'audit',
  };
}

function base(partial: Partial<ExpensePaymentRecognitionFields>): ExpensePaymentRecognitionFields {
  return {
    netAmount: '1000.000000',
    grossAmount: '1180.000000',
    taxAmount: '180.000000',
    currency: ILS,
    expenseDate: '2026-01-01',
    installmentCount: 5,
    installmentStartDate: '2026-01-01',
    installmentsPaidCount: 0,
    paidGrossAmount: '0',
    paidAt: null,
    cashInstallmentSchedule: null,
    ...partial,
  };
}

describe('installment payment recognition (owner policy)', () => {
  it('1,000 NET / 5 installments — 200 NET per verified paid month only', () => {
    const jan = base({
      installmentsPaidCount: 1,
      paidGrossAmount: '236.000000',
      paidAt: '2026-01-15',
      verifiedInstallmentPayments: [verifiedLine(0, '2026-01-01', '2026-01-15')],
    });
    expect(Number(recognizedExpenseNetInYearMonth(jan, '2026-01')?.amount)).toBeCloseTo(200, 2);
    expect(recognizedExpenseNetInYearMonth(jan, '2026-02')).toBeNull();

    const feb = base({
      installmentsPaidCount: 2,
      paidGrossAmount: '472.000000',
      paidAt: '2026-02-10',
      verifiedInstallmentPayments: [
        verifiedLine(0, '2026-01-01', '2026-01-15'),
        verifiedLine(1, '2026-02-01', '2026-02-10'),
      ],
    });
    expect(Number(recognizedExpenseNetInYearMonth(feb, '2026-02')?.amount)).toBeCloseTo(200, 2);

    const marUnpaid = base({
      installmentsPaidCount: 2,
      paidGrossAmount: '472.000000',
      paidAt: '2026-02-10',
      verifiedInstallmentPayments: [
        verifiedLine(0, '2026-01-01', '2026-01-15'),
        verifiedLine(1, '2026-02-01', '2026-02-10'),
      ],
    });
    expect(recognizedExpenseNetInYearMonth(marUnpaid, '2026-03')).toBeNull();

    const aprLate = base({
      installmentsPaidCount: 4,
      paidGrossAmount: '944.000000',
      paidAt: '2026-04-20',
      verifiedInstallmentPayments: [
        verifiedLine(0, '2026-01-01', '2026-01-15'),
        verifiedLine(1, '2026-02-01', '2026-02-10'),
        verifiedLine(2, '2026-03-01', '2026-04-20'),
        verifiedLine(3, '2026-04-01', '2026-04-20'),
      ],
    });
    expect(recognizedExpenseNetInYearMonth(aprLate, '2026-03')).toBeNull();
    expect(Number(recognizedExpenseNetInYearMonth(aprLate, '2026-04')?.amount)).toBeCloseTo(400, 2);
  });

  it('BMS manual lump does not recognize NET in September without per-installment evidence', () => {
    const row = base({
      installmentCount: 12,
      installmentsPaidCount: 9,
      paidGrossAmount: '8689.000000',
      paidAt: '2026-09-06',
      installmentPaymentStatus: 'PAID_DATE_UNKNOWN',
      verifiedInstallmentPayments: [],
      dateUnknownGross: '8689.000000',
    });
    expect(recognizedExpenseNetInYearMonth(row, '2026-09')).toBeNull();
    expect(recognizedExpenseNetInYearMonth(row, '2026-01')).toBeNull();
  });

  it('installments without verified evidence do not recognize on due date', () => {
    const row = base({
      installmentsPaidCount: 3,
      paidGrossAmount: '708.000000',
      paidAt: '2026-03-01',
    });
    expect(recognizedExpenseNetInYearMonth(row, '2026-03')).toBeNull();
  });

  it('F01b (a): partial single payment — February remainder + March paid slice', () => {
    const row = base({
      netAmount: '10000.000000',
      grossAmount: '11800.000000',
      installmentCount: 1,
      expenseDate: '2026-02-01',
      paidGrossAmount: '4720.000000',
      paidAt: '2026-03-15',
    });
    expect(Number(recognizedExpenseNetInYearMonth(row, '2026-02')?.amount)).toBeCloseTo(6000, 2);
    expect(Number(recognizedExpenseNetInYearMonth(row, '2026-03')?.amount)).toBeCloseTo(4000, 2);
  });

  it('F01b (b): fully paid in March after February expense — March only', () => {
    const row = base({
      netAmount: '10000.000000',
      grossAmount: '11800.000000',
      installmentCount: 1,
      expenseDate: '2026-02-01',
      paidGrossAmount: '11800.000000',
      paidAt: '2026-03-01',
    });
    expect(recognizedExpenseNetInYearMonth(row, '2026-02')).toBeNull();
    expect(Number(recognizedExpenseNetInYearMonth(row, '2026-03')?.amount)).toBeCloseTo(10000, 2);
  });

  it('F01b (c): unpaid — full NET in expense month', () => {
    const row = base({
      netAmount: '10000.000000',
      grossAmount: '11800.000000',
      installmentCount: 1,
      expenseDate: '2026-02-01',
      paidGrossAmount: '0',
      paidAt: null,
    });
    expect(Number(recognizedExpenseNetInYearMonth(row, '2026-02')?.amount)).toBeCloseTo(10000, 2);
  });

  it('zero-VAT expense uses NET = GROSS proportion', () => {
    const row = base({
      netAmount: '800.000000',
      grossAmount: '800.000000',
      taxAmount: null,
      installmentCount: 1,
      paidGrossAmount: '400.000000',
      paidAt: '2026-03-01',
    });
    expect(Number(recognizedExpenseNetInYearMonth(row, '2026-03')?.amount)).toBeCloseTo(400, 2);
  });
});

function verifiedEvenPayments(grossTotal: string, count: number): InstallmentPaymentSlice[] {
  return splitMoneyEvenly(money(grossTotal, ILS), count).map((share, index) => {
    const month = String(index + 1).padStart(2, '0');
    const date = `2026-${month}-15`;
    return verifiedLine(index, date, date, share.amount);
  });
}

function sumRecognizedNet(fields: ExpensePaymentRecognitionFields, count: number): MoneyValue {
  const parts: MoneyValue[] = [];
  for (let index = 0; index < count; index += 1) {
    const month = String(index + 1).padStart(2, '0');
    const slice = recognizedExpenseNetInYearMonth(fields, `2026-${month}`);
    if (slice) parts.push(slice);
  }
  return sumMoney(parts, ILS);
}

describe('installment net remainder on the last slice', () => {
  it('117.00 gross / 100.00 net in 3 slices of 39 sums to 100.00, not 99.99', () => {
    const payments = [0, 1, 2].map((index) => {
      const month = String(index + 1).padStart(2, '0');
      const date = `2026-${month}-15`;
      return verifiedLine(index, date, date, '39.000000');
    });
    const row = base({
      netAmount: '100.000000',
      grossAmount: '117.000000',
      taxAmount: '17.000000',
      installmentCount: 3,
      verifiedInstallmentPayments: payments,
    });

    expect(recognizedExpenseNetInYearMonth(row, '2026-01')?.amount).toBe('33.330000');
    expect(recognizedExpenseNetInYearMonth(row, '2026-02')?.amount).toBe('33.330000');
    expect(recognizedExpenseNetInYearMonth(row, '2026-03')?.amount).toBe('33.340000');
    expect(sumRecognizedNet(row, 3).amount).toBe('100.000000');
  });

  it('does not park the unpaid residue on a partial cover', () => {
    const row = base({
      netAmount: '100.000000',
      grossAmount: '117.000000',
      taxAmount: '17.000000',
      installmentCount: 3,
      verifiedInstallmentPayments: [0, 1].map((index) => {
        const month = String(index + 1).padStart(2, '0');
        const date = `2026-${month}-15`;
        return verifiedLine(index, date, date, '39.000000');
      }),
    });
    expect(recognizedExpenseNetInYearMonth(row, '2026-01')?.amount).toBe('33.330000');
    expect(recognizedExpenseNetInYearMonth(row, '2026-02')?.amount).toBe('33.330000');
    expect(sumRecognizedNet(row, 2).amount).toBe('66.660000');
  });

  it('1000 / 847.46 in 7 payments sums to 847.46, not 847.47', () => {
    const row = base({
      netAmount: '847.460000',
      grossAmount: '1000.000000',
      installmentCount: 7,
      verifiedInstallmentPayments: verifiedEvenPayments('1000.000000', 7),
    });
    expect(sumRecognizedNet(row, 7).amount).toBe('847.460000');
  });

  it('3333.33 / 2825.70 in 12 payments sums to 2825.70, not 2825.73', () => {
    const row = base({
      netAmount: '2825.700000',
      grossAmount: '3333.330000',
      installmentCount: 12,
      verifiedInstallmentPayments: verifiedEvenPayments('3333.330000', 12),
    });
    expect(sumRecognizedNet(row, 12).amount).toBe('2825.700000');
  });
});
