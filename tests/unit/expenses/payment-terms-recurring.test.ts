import { describe, expect, it } from 'vitest';
import { deriveDueDate, suggestDueDateFromPaymentTerm } from '@/modules/business-catalog';
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
import { resolveExpensePaymentStatus } from '@/modules/tenancy/domain/org-financial-policies';
import { money } from '@/shared/money';
import { businessDate } from '@/shared/dates';

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
    expect(resolveExpensePaymentStatus({
      paymentStatus: 'upcoming',
      dueDate: row.dueDate,
      paidAt: null,
      today: '2026-09-01',
    })).toBe('upcoming');
    expect(isExpenseDueSoon(row, businessDate('2026-09-01'))).toBe(false);
  });

  it('marks due soon within 7 days of December 2026 due date', () => {
    expect(isExpenseDueSoon(row, businessDate('2026-12-24'))).toBe(true);
    expect(isExpenseDueSoon(row, businessDate('2026-11-01'))).toBe(false);
  });
});

describe('automatic payment behavior', () => {
  const policies = {
    expensePaymentConfirmationMode: 'manual' as const,
    salaryPaymentConfirmationMode: 'manual' as const,
    salaryPaymentDay: 10,
  };

  it('recurring automatic vendor skips Owner confirmation', () => {
    const kind = resolveExpenseAutomaticPaymentKind({
      automaticInstallmentPayment: false,
      installmentCount: 1,
      vendor: { paymentConfirmationOverride: 'automatic' },
      policies,
    });
    expect(kind).toBe('vendor_recurring_automatic');
    expect(expenseRequiresOwnerPaymentConfirmation(kind, true)).toBe(false);
  });

  it('automatic installment schedule skips Owner confirmation', () => {
    const kind = resolveExpenseAutomaticPaymentKind({
      automaticInstallmentPayment: true,
      installmentCount: 12,
      vendor: null,
      policies,
    });
    expect(kind).toBe('installment_automatic');
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
