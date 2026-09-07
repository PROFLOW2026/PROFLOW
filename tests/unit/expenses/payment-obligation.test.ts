import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';
import { buildCashInstallmentSchedule } from '@/modules/expenses/domain/cash-installment-schedule';
import {
  obligationAlertSourceId,
  resolveExpensePaymentObligation,
} from '@/modules/expenses/domain/resolve-expense-payment-obligation';

describe('resolveExpensePaymentObligation', () => {
  it('single payment uses full gross as payable when unpaid', () => {
    const obligation = resolveExpensePaymentObligation(
      {
        grossAmount: '500.000000',
        currency: 'ILS',
        expenseDate: businessDate('2026-09-10'),
        installmentCount: 1,
        installmentStartDate: null,
        installmentsPaidCount: 0,
        paidGrossAmount: null,
        dueDate: businessDate('2026-09-10'),
        paymentStatus: 'due',
        paidAt: null,
      },
      businessDate('2026-09-10'),
    );
    expect(obligation.payableAmount.amount).toBe('500.000000');
    expect(obligation.isFullyPaid).toBe(false);
  });

  it('marks installment transaction fully paid only after all installments', () => {
    const obligation = resolveExpensePaymentObligation(
      {
        grossAmount: '1200.000000',
        currency: 'ILS',
        expenseDate: businessDate('2026-01-05'),
        installmentCount: 12,
        installmentStartDate: businessDate('2026-01-05'),
        installmentsPaidCount: 12,
        paidGrossAmount: '1200.000000',
        dueDate: null,
        paymentStatus: 'paid',
        paidAt: businessDate('2026-12-05'),
      },
      businessDate('2026-12-05'),
    );
    expect(obligation.isFullyPaid).toBe(true);
    expect(obligation.payableAmount.amount).toBe('0.000000');
  });

  it('uses schedule due dates instead of stored term due for installments', () => {
    const schedule = buildCashInstallmentSchedule({
      totalGross: money('4200', 'ILS'),
      installmentCount: 12,
      startDate: businessDate('2026-01-05'),
    });
    const obligation = resolveExpensePaymentObligation(
      {
        grossAmount: '4200.000000',
        currency: 'ILS',
        expenseDate: businessDate('2026-01-05'),
        installmentCount: 12,
        installmentStartDate: businessDate('2026-01-05'),
        installmentsPaidCount: 8,
        paidGrossAmount: '2800.000000',
        dueDate: businessDate('2026-12-29'),
        paymentStatus: 'due',
        paidAt: businessDate('2026-08-05'),
      },
      businessDate('2026-09-05'),
    );
    expect(obligation.effectiveDueDate).toBe(schedule[8]?.dueDate);
    expect(obligation.payableAmount.amount).toBe('350.000000');
  });

  it('generates stable alert ids per installment', () => {
    const obligation = resolveExpensePaymentObligation(
      {
        grossAmount: '1000.000000',
        currency: 'ILS',
        expenseDate: businessDate('2026-01-01'),
        installmentCount: 4,
        installmentStartDate: businessDate('2026-01-01'),
        installmentsPaidCount: 0,
        paidGrossAmount: null,
        dueDate: businessDate('2026-01-01'),
        paymentStatus: 'due',
        paidAt: null,
      },
      businessDate('2026-01-01'),
    );
    expect(obligationAlertSourceId('abc', obligation)).toBe('abc:inst-0');
  });
});
