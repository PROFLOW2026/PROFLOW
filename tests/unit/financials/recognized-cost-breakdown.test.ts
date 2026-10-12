import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';
import { recognitionDateForExpenseInYearMonth } from '@/modules/financials/domain/recognized-cost-breakdown';
import type { ExpensePaymentRecognitionFields } from '@/modules/expenses/domain/installment-payment-recognition';

function fields(
  partial: Partial<ExpensePaymentRecognitionFields> = {},
): ExpensePaymentRecognitionFields {
  return {
    expenseDate: businessDate('2026-03-15'),
    netAmount: '100',
    grossAmount: '118',
    currency: 'ILS',
    installmentCount: 1,
    installmentStartDate: null,
    installmentsPaidCount: 0,
    paidGrossAmount: null,
    paidAt: null,
    cashInstallmentSchedule: null,
    verifiedInstallmentPayments: [],
    ...partial,
  };
}

describe('recognitionDateForExpenseInYearMonth', () => {
  it('uses verified installment payment date in the payment month', () => {
    const date = recognitionDateForExpenseInYearMonth(
      fields({
        installmentCount: 12,
        verifiedInstallmentPayments: [
          {
            installmentIndex: 1,
            dueDate: businessDate('2026-04-01'),
            actualPaidAt: businessDate('2026-04-10'),
            grossPaid: money('100', 'ILS'),
            verification: 'verified',
            source: 'ledger',
          },
        ],
      }),
      '2026-04',
    );
    expect(date).toBe('2026-04-10');
  });

  it('falls back to month start for multi-installment accrual without payment in month', () => {
    const date = recognitionDateForExpenseInYearMonth(
      fields({ installmentCount: 12, expenseDate: businessDate('2026-01-05') }),
      '2026-06',
    );
    expect(date).toBe('2026-06-01');
  });
});
