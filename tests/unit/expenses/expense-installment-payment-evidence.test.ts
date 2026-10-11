import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import {
  resolveVerifiedInstallmentPayments,
  verifiedInstallmentPaymentsFromAudits,
} from '@/modules/expenses/domain/expense-installment-payment-evidence';

describe('expense installment payment evidence', () => {
  it('builds verified payments from audit events with installmentIndex', () => {
    const dueDates = [
      businessDate('2026-03-01'),
      businessDate('2026-04-01'),
    ] as const;
    const payments = verifiedInstallmentPaymentsFromAudits(
      [
        {
          action: 'expense.payment_confirmed',
          createdAt: '2026-09-06T20:14:33.150Z',
          after: {
            paidAt: '2026-03-01',
            paidGrossAmount: '352.080000',
            installmentIndex: 0,
            source: 'automatic_installment_policy',
          },
        },
      ],
      dueDates,
      'ILS',
    );
    expect(payments).toHaveLength(1);
    expect(payments[0]?.actualPaidAt).toBe('2026-03-01');
    expect(payments[0]?.installmentIndex).toBe(0);
  });

  it('resolveVerifiedInstallmentPayments merges audit for cellular-like row', () => {
    const resolved = resolveVerifiedInstallmentPayments({
      grossAmount: '8450.000000',
      currency: 'ILS',
      installmentCount: 24,
      installmentStartDate: '2026-03-01',
      expenseDate: '2026-03-01',
      cashInstallmentSchedule: null,
      audits: [
        {
          action: 'expense.payment_confirmed',
          createdAt: '2026-09-06T20:14:33.150Z',
          after: {
            paidAt: '2026-03-01',
            paidGrossAmount: '352.080000',
            installmentIndex: 0,
          },
        },
      ],
    });
    expect(resolved.length).toBeGreaterThanOrEqual(1);
    expect(resolved[0]?.grossPaid.amount).toBe('352.080000');
  });
});
