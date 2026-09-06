import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import {
  isExpenseDueToday,
  isExpenseOverdue,
  isExpensePendingReview,
  isExpenseUpcoming,
} from '@/modules/expenses/domain/payment-lifecycle';
import { groupInboxForToday, withItemDefaults } from '@/modules/command-center/domain/ranking';
import type { CommandCenterItem } from '@/modules/command-center/domain/types';

describe('Owner payment Today collectors — classification', () => {
  const base = {
    id: 'e1',
    expenseDate: businessDate('2026-09-01'),
    paidAt: null,
    paidGrossAmount: null,
    paymentConfirmationSource: null,
    grossAmount: '1000',
    currency: 'ILS',
    description: 'Office',
    supplierName: 'Vendor',
    projectId: null,
    status: 'finalized',
  };

  it('treats legacy rows without due date as pending review, not overdue', () => {
    const legacy = {
      ...base,
      dueDate: null,
      paymentStatus: null,
    };
    expect(isExpensePendingReview(legacy)).toBe(true);
    expect(isExpenseOverdue(legacy, businessDate('2026-09-06'))).toBe(false);
    expect(isExpenseDueToday(legacy, businessDate('2026-09-06'))).toBe(false);
  });

  it('classifies due today, overdue, and upcoming from due date', () => {
    const dueToday = { ...base, dueDate: businessDate('2026-09-06'), paymentStatus: 'due' as const };
    const overdue = { ...base, dueDate: businessDate('2026-09-05'), paymentStatus: 'overdue' as const };
    const upcoming = { ...base, dueDate: businessDate('2026-09-10'), paymentStatus: 'upcoming' as const };
    const today = businessDate('2026-09-06');

    expect(isExpenseDueToday(dueToday, today)).toBe(true);
    expect(isExpenseOverdue(overdue, today)).toBe(true);
    expect(isExpenseUpcoming(upcoming, today)).toBe(true);
    expect(isExpenseOverdue(upcoming, today)).toBe(false);
  });
});

describe('Today inbox grouping', () => {
  it('places pending payment items in a dedicated section first', () => {
    const payment = withItemDefaults({
      sourceType: 'expense_pending_review',
      sourceId: 'e1',
      what: 'הוצאה ממתינה',
      why: 'why',
      where: 'where',
      href: '/expenses/e1',
      confirmPaid: 'expense',
    });
    const other = withItemDefaults({
      sourceType: 'missing_attendance_today',
      sourceId: '2026-09-06',
      what: 'חסר דיווח',
      why: 'why',
      where: 'where',
      href: '/workforce/attendance',
      severity: 'medium',
    });

    const sections = groupInboxForToday([other, payment] as CommandCenterItem[]);
    expect(sections[0]?.key).toBe('pendingPayments');
    expect(sections[0]?.items.map((item) => item.sourceType)).toEqual(['expense_pending_review']);
    expect(sections.some((section) => section.key === 'medium')).toBe(true);
  });
});
