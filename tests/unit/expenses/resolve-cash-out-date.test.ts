import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { resolveExpenseCashOutDate } from '@/modules/expenses/domain/resolve-cash-out-date';

describe('resolveExpenseCashOutDate', () => {
  it('prefers explicit paid date over card debit rule', () => {
    expect(
      resolveExpenseCashOutDate({
        expenseDate: businessDate('2026-09-06'),
        explicitPaidAt: businessDate('2026-09-20'),
        paymentMethod: 'credit_card',
        cardMonthlyDebitDay: 10,
        installmentDueDate: null,
        termDueDate: businessDate('2026-10-01'),
      }),
    ).toBe('2026-09-20');
  });

  it('uses installment due date when no explicit paid date', () => {
    expect(
      resolveExpenseCashOutDate({
        expenseDate: businessDate('2026-09-06'),
        explicitPaidAt: null,
        paymentMethod: 'credit_card',
        cardMonthlyDebitDay: 10,
        installmentDueDate: businessDate('2026-10-15'),
        termDueDate: businessDate('2026-10-01'),
      }),
    ).toBe('2026-10-15');
  });

  it('derives credit-card debit day from expense date', () => {
    expect(
      resolveExpenseCashOutDate({
        expenseDate: businessDate('2026-09-06'),
        explicitPaidAt: null,
        paymentMethod: 'credit_card',
        cardMonthlyDebitDay: 10,
        installmentDueDate: null,
        termDueDate: null,
      }),
    ).toBe('2026-09-10');
  });

  it('falls back to payment term due date', () => {
    expect(
      resolveExpenseCashOutDate({
        expenseDate: businessDate('2026-09-06'),
        explicitPaidAt: null,
        paymentMethod: 'transfer',
        cardMonthlyDebitDay: null,
        installmentDueDate: null,
        termDueDate: businessDate('2026-10-05'),
      }),
    ).toBe('2026-10-05');
  });

  it('returns null when nothing applies', () => {
    expect(
      resolveExpenseCashOutDate({
        expenseDate: businessDate('2026-09-06'),
        explicitPaidAt: null,
        paymentMethod: 'check',
        cardMonthlyDebitDay: null,
        installmentDueDate: null,
        termDueDate: null,
      }),
    ).toBeNull();
  });
});
