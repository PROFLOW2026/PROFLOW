import { describe, expect, it } from 'vitest';
import {
  recognizedExpenseNetInYearMonth,
  type ExpensePaymentRecognitionFields,
} from '@/modules/expenses/domain/installment-payment-recognition';

const ILS = 'ILS';

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
  it('1,000 NET / 5 installments — 200 NET per paid month only', () => {
    const jan = base({
      installmentsPaidCount: 1,
      paidGrossAmount: '236.000000',
      paidAt: '2026-01-15',
    });
    expect(Number(recognizedExpenseNetInYearMonth(jan, '2026-01')?.amount)).toBeCloseTo(200, 2);
    expect(recognizedExpenseNetInYearMonth(jan, '2026-02')).toBeNull();

    const feb = base({
      installmentsPaidCount: 2,
      paidGrossAmount: '472.000000',
      paidAt: '2026-02-10',
    });
    expect(Number(recognizedExpenseNetInYearMonth(feb, '2026-02')?.amount)).toBeCloseTo(200, 2);

    const marUnpaid = base({
      installmentsPaidCount: 2,
      paidGrossAmount: '472.000000',
      paidAt: '2026-02-10',
    });
    expect(recognizedExpenseNetInYearMonth(marUnpaid, '2026-03')).toBeNull();

    const apr = base({
      installmentsPaidCount: 4,
      paidGrossAmount: '944.000000',
      paidAt: '2026-04-20',
    });
    expect(Number(recognizedExpenseNetInYearMonth(apr, '2026-03')?.amount)).toBeCloseTo(200, 2);
    expect(Number(recognizedExpenseNetInYearMonth(apr, '2026-04')?.amount)).toBeCloseTo(200, 2);
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
