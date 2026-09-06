import { describe, expect, it } from 'vitest';
import {
  adjustMonthlyCompensationForUnpaidAbsence,
  isWithinEmploymentRange,
  resolveAttendanceDayState,
} from '@/modules/workforce/domain/employment-active-range';
import {
  resolveExpensePaymentStatus,
  salaryDueDateForPeriod,
} from '@/modules/tenancy/domain/org-financial-policies';
import { isExpenseDueToday, isExpenseOverdue } from '@/modules/expenses/domain/payment-lifecycle';
import { businessDate } from '@/shared/dates';

describe('Owner business decisions — employment active range', () => {
  it('excludes dates before hire and after end', () => {
    expect(
      isWithinEmploymentRange(businessDate('2026-01-15'), {
        hireDate: businessDate('2026-04-01'),
        endDate: null,
      }),
    ).toBe(false);
    expect(
      isWithinEmploymentRange(businessDate('2026-05-01'), {
        hireDate: businessDate('2026-04-01'),
        endDate: businessDate('2026-04-30'),
      }),
    ).toBe(false);
    expect(
      isWithinEmploymentRange(businessDate('2026-04-15'), {
        hireDate: businessDate('2026-04-01'),
        endDate: null,
      }),
    ).toBe(true);
  });

  it('marks pre-employment as not applicable, not missing', () => {
    expect(
      resolveAttendanceDayState({
        workDate: businessDate('2026-01-10'),
        employment: { hireDate: businessDate('2026-04-01'), endDate: null },
        outcome: null,
      }),
    ).toBe('not_applicable');
  });

  it('adjusts monthly compensation for unpaid absence proportionally', () => {
    expect(
      adjustMonthlyCompensationForUnpaidAbsence({
        baseAmount: '20000',
        relevantWorkDays: 20,
        unpaidAbsenceDays: 2,
      }),
    ).toBe('18000.000000');
  });

  it('does not adjust when no unpaid absence days', () => {
    expect(
      adjustMonthlyCompensationForUnpaidAbsence({
        baseAmount: '20000',
        relevantWorkDays: 20,
        unpaidAbsenceDays: 0,
      }),
    ).toBe('20000');
  });
});

describe('Owner business decisions — expense payment lifecycle', () => {
  const row = {
    id: 'e1',
    expenseDate: businessDate('2026-09-01'),
    dueDate: businessDate('2026-09-06'),
    paymentStatus: 'due' as const,
    paidAt: null,
    paidGrossAmount: null,
    paymentConfirmationSource: null,
    grossAmount: '10000',
    currency: 'ILS',
    description: 'Test',
    supplierName: 'Vendor',
    projectId: null,
    status: 'finalized',
  };

  it('flags due today and overdue separately', () => {
    expect(isExpenseDueToday(row, businessDate('2026-09-06'))).toBe(true);
    expect(isExpenseOverdue(row, businessDate('2026-09-07'))).toBe(true);
  });

  it('resolves payment status from due date', () => {
    expect(
      resolveExpensePaymentStatus({
        paymentStatus: null,
        dueDate: '2026-09-06',
        paidAt: null,
        today: '2026-09-06',
      }),
    ).toBe('due');
    expect(
      resolveExpensePaymentStatus({
        paymentStatus: null,
        dueDate: '2026-09-05',
        paidAt: null,
        today: '2026-09-06',
      }),
    ).toBe('overdue');
  });
});

describe('Owner business decisions — salary due date', () => {
  it('places August payroll due on configured day in September', () => {
    expect(salaryDueDateForPeriod('2026-08', 10)).toBe('2026-09-10');
  });
});
