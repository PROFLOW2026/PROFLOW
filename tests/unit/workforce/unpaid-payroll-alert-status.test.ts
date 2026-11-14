import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import {
  resolveDisplayedPayrollPaymentStatus,
  resolveUnpaidPayrollAlertStatus,
} from '@/modules/workforce/domain/payroll-obligation';

describe('resolveUnpaidPayrollAlertStatus', () => {
  const today = businessDate('2026-11-14');

  it('marks obligations past due as overdue regardless of stored payment_status', () => {
    expect(resolveUnpaidPayrollAlertStatus(businessDate('2026-11-10'), today)).toBe('overdue');
  });

  it('classifies due today and upcoming', () => {
    expect(resolveUnpaidPayrollAlertStatus(businessDate('2026-11-14'), today)).toBe('due');
    expect(resolveUnpaidPayrollAlertStatus(businessDate('2026-11-20'), today)).toBe('upcoming');
  });

  it('uses pending_review when due date is missing', () => {
    expect(resolveUnpaidPayrollAlertStatus(null, today)).toBe('pending_review');
  });
});

describe('resolveDisplayedPayrollPaymentStatus', () => {
  const today = businessDate('2026-11-14');

  it('shows paid only when paidAt is set (employer-cost edit never implies paid)', () => {
    expect(
      resolveDisplayedPayrollPaymentStatus({
        paidAt: '2026-11-12',
        dueDate: businessDate('2026-11-10'),
        today,
      }),
    ).toBe('paid');
  });

  it('derives overdue from due date when unpaid even if DB still says upcoming', () => {
    expect(
      resolveDisplayedPayrollPaymentStatus({
        paidAt: null,
        dueDate: businessDate('2026-11-10'),
        today,
      }),
    ).toBe('overdue');
  });
});