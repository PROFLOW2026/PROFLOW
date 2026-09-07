import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';
import {
  buildCashInstallmentSchedule,
  nextOccurrenceOfDayOfMonth,
} from '@/modules/expenses/domain/cash-installment-schedule';
import {
  expenseRequiresOwnerPaymentConfirmation,
  resolveExpenseAutomaticPaymentKind,
} from '@/modules/expenses/domain/payment-behavior';
import {
  isExpenseDueSoon,
  isExpensePendingReview,
} from '@/modules/expenses/domain/payment-lifecycle';
import {
  obligationAlertSourceId,
  resolveExpensePaymentObligation,
} from '@/modules/expenses/domain/resolve-expense-payment-obligation';
import { resolveExpensePaymentStatus } from '@/modules/tenancy/domain/org-financial-policies';
import { deriveDueDate, suggestDueDateFromPaymentTerm } from '@/modules/business-catalog';

describe('vendor payment terms drive due date', () => {
  it('derives eom+120 from August 2026 document date to late December 2026', () => {
    const due = deriveDueDate('2026-08-15', { strategy: 'eom_plus_days', eomOffsetDays: 120 });
    expect(due).toBe('2026-12-29');
  });

  it('explicit due date override wins over term suggestion', () => {
    expect(
      suggestDueDateFromPaymentTerm({
        baseDateIso: '2026-08-15',
        dueDate: '2027-01-15',
        term: { strategy: 'eom_plus_days', eomOffsetDays: 120 },
      }),
    ).toBe('2027-01-15');
  });
});

describe('payment alert relevance', () => {
  const row = {
    id: 'e1',
    expenseDate: businessDate('2026-08-15'),
    dueDate: businessDate('2026-12-29'),
    paymentStatus: 'upcoming' as const,
    paidAt: null,
    paidGrossAmount: null,
    paymentConfirmationSource: null,
    grossAmount: '1000.000000',
    currency: 'ILS',
    description: null,
    supplierName: 'Supplier A',
    projectId: null,
    status: 'finalized',
  };

  it('does not treat future-due expenses as pending review', () => {
    expect(isExpensePendingReview(row)).toBe(false);
  });

  it('does not surface September 2026 actionable alerts for December due date', () => {
    expect(
      resolveExpensePaymentStatus({
        paymentStatus: 'upcoming',
        dueDate: row.dueDate,
        paidAt: null,
        today: '2026-09-01',
      }),
    ).toBe('upcoming');
    expect(isExpenseDueSoon(row, businessDate('2026-09-01'))).toBe(false);
  });

  it('marks due soon within 7 days of December 2026 due date', () => {
    expect(isExpenseDueSoon(row, businessDate('2026-12-24'))).toBe(true);
    expect(isExpenseDueSoon(row, businessDate('2026-11-01'))).toBe(false);
  });
});

describe('automatic payment behavior — org opt-in only', () => {
  const manualPolicies = {
    expensePaymentConfirmationMode: 'manual' as const,
    salaryPaymentConfirmationMode: 'manual' as const,
    salaryPaymentDay: 10,
  };
  const autoPolicies = {
    ...manualPolicies,
    expensePaymentConfirmationMode: 'automatic_on_due' as const,
  };

  it('manual org requires Owner confirmation even for recurring vendor override', () => {
    const kind = resolveExpenseAutomaticPaymentKind({
      automaticInstallmentPayment: false,
      installmentCount: 1,
      vendor: { paymentConfirmationOverride: 'automatic' },
      policies: manualPolicies,
    });
    expect(kind).toBe('none');
    expect(expenseRequiresOwnerPaymentConfirmation(kind, true)).toBe(true);
  });

  it('manual org requires Owner confirmation for recurring expense templates', () => {
    const kind = resolveExpenseAutomaticPaymentKind({
      automaticInstallmentPayment: false,
      installmentCount: 1,
      vendor: null,
      recurringDraft: { paymentConfirmationOverride: 'org_default', draftKind: 'expense' },
      policies: manualPolicies,
    });
    expect(kind).toBe('none');
    expect(expenseRequiresOwnerPaymentConfirmation(kind, true)).toBe(true);
  });

  it('manual org requires Owner confirmation for installment schedules', () => {
    const kind = resolveExpenseAutomaticPaymentKind({
      automaticInstallmentPayment: false,
      installmentCount: 12,
      vendor: null,
      policies: manualPolicies,
    });
    expect(kind).toBe('none');
    expect(expenseRequiresOwnerPaymentConfirmation(kind, true)).toBe(true);
  });

  it('auto org enables installment automatic payments', () => {
    const kind = resolveExpenseAutomaticPaymentKind({
      automaticInstallmentPayment: false,
      installmentCount: 12,
      vendor: null,
      policies: autoPolicies,
    });
    expect(kind).toBe('installment_automatic');
    expect(expenseRequiresOwnerPaymentConfirmation(kind, true)).toBe(false);
  });

  it('auto org enables single-payment automatic confirmation', () => {
    const kind = resolveExpenseAutomaticPaymentKind({
      automaticInstallmentPayment: false,
      installmentCount: 1,
      vendor: null,
      recurringDraft: { paymentConfirmationOverride: 'automatic', draftKind: 'expense' },
      policies: autoPolicies,
    });
    expect(kind).toBe('org_automatic_on_due');
    expect(expenseRequiresOwnerPaymentConfirmation(kind, true)).toBe(false);
  });
});

describe('cash installment schedule', () => {
  it('builds 12 equal monthly installments from start date', () => {
    const schedule = buildCashInstallmentSchedule({
      totalGross: money('12000', 'ILS'),
      installmentCount: 12,
      startDate: businessDate('2026-01-05'),
    });
    expect(schedule).toHaveLength(12);
    expect(schedule[0]?.dueDate).toBe('2026-01-05');
    expect(schedule[11]?.dueDate).toBe('2026-12-05');
    expect(schedule[0]?.amount.amount).toBe('1000.000000');
  });

  it('finds next recurring payment day after mid-month expense', () => {
    expect(nextOccurrenceOfDayOfMonth(businessDate('2026-08-15'), 10)).toBe('2026-09-10');
  });
});

describe('payment obligation scenarios A–J', () => {
  const today = businessDate('2026-09-05');

  it('A — 4200 in 12 payments shows 350 payable for the next sequential installment', () => {
    const obligation = resolveExpensePaymentObligation(
      {
        grossAmount: '4200.000000',
        currency: 'ILS',
        expenseDate: businessDate('2026-01-05'),
        installmentCount: 12,
        installmentStartDate: businessDate('2026-01-05'),
        installmentsPaidCount: 8,
        paidGrossAmount: '2800.000000',
        dueDate: businessDate('2026-09-05'),
        paymentStatus: 'due',
        paidAt: businessDate('2026-08-05'),
      },
      today,
    );
    expect(obligation.payableAmount.amount).toBe('350.000000');
    expect(obligation.transactionTotal.amount).toBe('4200.000000');
    expect(obligation.effectiveDueDate).toBe('2026-09-05');
  });

  it('B — first installment paid leaves 750 remaining and 250 next payable', () => {
    const obligation = resolveExpensePaymentObligation(
      {
        grossAmount: '1000.000000',
        currency: 'ILS',
        expenseDate: businessDate('2026-06-01'),
        installmentCount: 4,
        installmentStartDate: businessDate('2026-06-01'),
        installmentsPaidCount: 1,
        paidGrossAmount: '250.000000',
        dueDate: businessDate('2026-09-01'),
        paymentStatus: 'upcoming',
        paidAt: businessDate('2026-06-01'),
      },
      today,
    );
    expect(obligation.totalPaid.amount).toBe('250.000000');
    expect(obligation.totalRemaining.amount).toBe('750.000000');
    expect(obligation.payableAmount.amount).toBe('250.000000');
    expect(obligation.currentInstallmentIndex).toBe(1);
  });

  it('C — rounding split sums to exactly 1000', () => {
    const schedule = buildCashInstallmentSchedule({
      totalGross: money('1000', 'ILS'),
      installmentCount: 3,
      startDate: businessDate('2026-01-01'),
    });
    const sum = schedule.reduce((acc, line) => acc + Number(line.amount.amount), 0);
    expect(sum).toBeCloseTo(1000, 5);
  });

  it('H — partial payment leaves 150 open on current installment', () => {
    const obligation = resolveExpensePaymentObligation(
      {
        grossAmount: '4200.000000',
        currency: 'ILS',
        expenseDate: businessDate('2026-09-05'),
        installmentCount: 12,
        installmentStartDate: businessDate('2026-09-05'),
        installmentsPaidCount: 0,
        paidGrossAmount: '200.000000',
        dueDate: businessDate('2026-09-05'),
        paymentStatus: 'upcoming',
        paidAt: null,
      },
      today,
    );
    expect(obligation.payableAmount.amount).toBe('150.000000');
    expect(obligation.isFullyPaid).toBe(false);
    expect(obligation.currentInstallmentIndex).toBe(0);
  });

  it('J — installment alert source id is stable per installment index', () => {
    const obligation = resolveExpensePaymentObligation(
      {
        grossAmount: '1000.000000',
        currency: 'ILS',
        expenseDate: businessDate('2026-06-01'),
        installmentCount: 4,
        installmentStartDate: businessDate('2026-06-01'),
        installmentsPaidCount: 2,
        paidGrossAmount: '500.000000',
        dueDate: businessDate('2026-08-01'),
        paymentStatus: 'upcoming',
        paidAt: null,
      },
      today,
    );
    expect(obligationAlertSourceId('exp-1', obligation)).toBe('exp-1:inst-2');
  });
});
