import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';
import {
  buildCashInstallmentSchedule,
  installmentsPaidCountFromPaidGross,
} from '@/modules/expenses/domain/cash-installment-schedule';
import { resolveExpenseAutomaticPaymentKind } from '@/modules/expenses/domain/payment-behavior';
import { resolveExpensePaymentObligation } from '@/modules/expenses/domain/resolve-expense-payment-obligation';

const autoPolicies = {
  expensePaymentConfirmationMode: 'automatic_on_due' as const,
  salaryPaymentConfirmationMode: 'manual' as const,
  salaryPaymentDay: 10,
};

const manualPolicies = {
  expensePaymentConfirmationMode: 'manual' as const,
  salaryPaymentConfirmationMode: 'manual' as const,
  salaryPaymentDay: 10,
};

function installmentRow(overrides: {
  readonly installmentsPaidCount?: number;
  readonly paidGrossAmount?: string | null;
  readonly dueDate?: string;
}) {
  return {
    grossAmount: '4200.000000',
    currency: 'ILS',
    expenseDate: businessDate('2026-01-05'),
    installmentCount: 12,
    installmentStartDate: businessDate('2026-01-05'),
    installmentsPaidCount: overrides.installmentsPaidCount ?? 0,
    paidGrossAmount: overrides.paidGrossAmount ?? null,
    dueDate: businessDate(overrides.dueDate ?? '2026-01-05'),
    paymentStatus: 'upcoming' as const,
    paidAt: null,
  };
}

describe('automatic payment execution planning', () => {
  it('A — auto ON + installment due today → payable is current installment only', () => {
    const today = businessDate('2026-10-05');
    const obligation = resolveExpensePaymentObligation(
      installmentRow({ installmentsPaidCount: 9, paidGrossAmount: '3150.000000', dueDate: '2026-10-05' }),
      today,
    );
    expect(obligation.payableAmount.amount).toBe('350.000000');
    expect(obligation.isFullyPaid).toBe(false);
    expect(obligation.effectiveDueDate).toBe('2026-10-05');
  });

  it('B — auto ON + future installment → not actionable today', () => {
    const today = businessDate('2026-10-04');
    const obligation = resolveExpensePaymentObligation(
      installmentRow({ installmentsPaidCount: 9, paidGrossAmount: '3150.000000', dueDate: '2026-10-05' }),
      today,
    );
    expect(obligation.effectiveDueDate).toBe('2026-10-05');
    expect(obligation.effectiveDueDate! > today).toBe(true);
  });

  it('C — auto OFF org never enters automatic payment kind', () => {
    const kind = resolveExpenseAutomaticPaymentKind({
      automaticInstallmentPayment: false,
      installmentCount: 12,
      vendor: null,
      policies: manualPolicies,
    });
    expect(kind).toBe('none');
  });

  it('D — after full installment paid, obligation blocks second application', () => {
    const today = businessDate('2026-10-05');
    const afterPay = resolveExpensePaymentObligation(
      installmentRow({ installmentsPaidCount: 10, paidGrossAmount: '3500.000000', dueDate: '2026-11-05' }),
      today,
    );
    expect(afterPay.currentInstallmentIndex).toBe(10);
    expect(afterPay.payableAmount.amount).toBe('350.000000');
    const fullyPaidSlice = resolveExpensePaymentObligation(
      {
        ...installmentRow({ installmentsPaidCount: 10, paidGrossAmount: '3500.000000' }),
        paidGrossAmount: '3850.000000',
        installmentsPaidCount: 11,
        dueDate: businessDate('2026-11-05'),
      },
      today,
    );
    expect(fullyPaidSlice.payableAmount.amount).toBe('350.000000');
    const simulatedSecondRun = resolveExpensePaymentObligation(
      {
        ...installmentRow({ installmentsPaidCount: 10 }),
        paidGrossAmount: '3850.000000',
        installmentsPaidCount: 11,
        dueDate: businessDate('2026-11-05'),
        paymentStatus: 'upcoming',
      },
      today,
    );
    expect(simulatedSecondRun.payableAmount.amount).toBe('350.000000');
  });

  it('E — overdue installment from previous day remains payable on catch-up', () => {
    const today = businessDate('2026-10-06');
    const obligation = resolveExpensePaymentObligation(
      installmentRow({ installmentsPaidCount: 9, paidGrossAmount: '3150.000000', dueDate: '2026-10-05' }),
      today,
    );
    expect(obligation.effectiveDueDate).toBe('2026-10-05');
    expect(obligation.effectiveDueDate! < today).toBe(true);
    expect(obligation.payableAmount.amount).toBe('350.000000');
  });

  it('F — recurring single occurrence uses org auto only when automatic_on_due', () => {
    expect(
      resolveExpenseAutomaticPaymentKind({
        automaticInstallmentPayment: false,
        installmentCount: 1,
        vendor: null,
        recurringDraft: { paymentConfirmationOverride: 'automatic', draftKind: 'expense' },
        policies: autoPolicies,
      }),
    ).toBe('org_automatic_on_due');
    expect(
      resolveExpenseAutomaticPaymentKind({
        automaticInstallmentPayment: false,
        installmentCount: 1,
        vendor: null,
        recurringDraft: { paymentConfirmationOverride: 'automatic', draftKind: 'expense' },
        policies: manualPolicies,
      }),
    ).toBe('none');
  });

  it('G — partial manual payment leaves only remainder for auto completion', () => {
    const today = businessDate('2026-10-05');
    const obligation = resolveExpensePaymentObligation(
      installmentRow({ installmentsPaidCount: 9, paidGrossAmount: '3350.000000', dueDate: '2026-10-05' }),
      today,
    );
    expect(obligation.payableAmount.amount).toBe('150.000000');
  });

  it('H — full transaction not closed until cumulative reaches total', () => {
    const schedule = buildCashInstallmentSchedule({
      totalGross: money('4200', 'ILS'),
      installmentCount: 12,
      startDate: businessDate('2026-01-05'),
    });
    const count = installmentsPaidCountFromPaidGross({
      schedule,
      paidGross: money('3850', 'ILS'),
    });
    expect(count).toBe(11);
    const obligation = resolveExpensePaymentObligation(
      {
        ...installmentRow({ installmentsPaidCount: 11, paidGrossAmount: '3850.000000' }),
        dueDate: businessDate('2026-12-05'),
      },
      businessDate('2026-12-05'),
    );
    expect(obligation.isFullyPaid).toBe(false);
    expect(obligation.totalRemaining.amount).toBe('350.000000');
  });
});

describe('installmentsPaidCountFromPaidGross', () => {
  it('does not advance count on partial installment payment', () => {
    const schedule = buildCashInstallmentSchedule({
      totalGross: money('1000', 'ILS'),
      installmentCount: 4,
      startDate: businessDate('2026-06-01'),
    });
    expect(
      installmentsPaidCountFromPaidGross({ schedule, paidGross: money('200', 'ILS') }),
    ).toBe(0);
    expect(
      installmentsPaidCountFromPaidGross({ schedule, paidGross: money('250', 'ILS') }),
    ).toBe(1);
  });
});
