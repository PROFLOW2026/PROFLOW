import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import {
  isExpenseDueToday,
  isExpenseDueSoon,
  isExpenseOverdue,
  isExpensePendingReview,
} from '@/modules/expenses/domain/payment-lifecycle';

describe('expense payment actionable window', () => {
  const base = {
    id: 'e1',
    expenseDate: businessDate('2026-09-01'),
    paidAt: null,
    paidGrossAmount: null,
    paymentConfirmationSource: null,
    grossAmount: '1000',
    currency: 'ILS',
    description: 'Rent',
    supplierName: 'Landlord',
    projectId: null,
    status: 'finalized',
    paymentStatus: 'upcoming' as const,
  };

  const today = businessDate('2026-09-06');

  it('does not classify future due_date as due today, overdue, or due soon', () => {
    const future = { ...base, dueDate: businessDate('2026-09-30') };
    expect(isExpenseDueToday(future, today)).toBe(false);
    expect(isExpenseOverdue(future, today)).toBe(false);
    expect(isExpenseDueSoon(future, today)).toBe(false);
    expect(isExpensePendingReview(future)).toBe(false);
  });

  it('classifies due today and overdue correctly', () => {
    expect(isExpenseDueToday({ ...base, dueDate: today, paymentStatus: 'due' }, today)).toBe(true);
    expect(
      isExpenseOverdue({ ...base, dueDate: businessDate('2026-09-05'), paymentStatus: 'overdue' }, today),
    ).toBe(true);
  });
});
