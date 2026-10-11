import { describe, expect, it } from 'vitest';
import {
  resolveInstallmentPaymentState,
  resolveVerifiedInstallmentPayments,
} from '@/modules/expenses/domain/expense-installment-payment-evidence';

describe('expense installment payment evidence', () => {
  it('builds verified indexed payments from audit events', () => {
    const state = resolveInstallmentPaymentState({
      grossAmount: '1180.000000',
      currency: 'ILS',
      installmentCount: 2,
      installmentStartDate: '2026-03-01',
      expenseDate: '2026-03-01',
      cashInstallmentSchedule: null,
      installmentsPaidCount: 1,
      paidGrossAmount: '590.000000',
      paidAt: '2026-03-01',
      audits: [
        {
          action: 'expense.payment_confirmed',
          createdAt: '2026-09-06T20:14:33.150Z',
          after: {
            paidAt: '2026-03-01',
            paidGrossAmount: '590.000000',
            installmentIndex: 0,
            source: 'automatic_installment_policy',
          },
        },
      ],
    });
    expect(state.status).toBe('PAID_VERIFIED');
    expect(state.slices).toHaveLength(1);
    expect(state.slices[0]?.actualPaidAt).toBe('2026-03-01');
  });

  it('manual lump audit on multi-installment expense is PAID_DATE_UNKNOWN (BMS)', () => {
    const state = resolveInstallmentPaymentState({
      grossAmount: '8689.000000',
      currency: 'ILS',
      installmentCount: 12,
      installmentStartDate: '2026-01-01',
      expenseDate: '2026-01-01',
      cashInstallmentSchedule: null,
      installmentsPaidCount: 9,
      paidGrossAmount: '8689.000000',
      paidAt: '2026-09-06',
      audits: [
        {
          action: 'expense.payment_confirmed',
          createdAt: '2026-09-06T18:29:02.081Z',
          after: {
            paidAt: '2026-09-06',
            source: 'manual',
            paidGrossAmount: '8689.000000',
          },
        },
      ],
    });
    expect(state.status).toBe('PAID_DATE_UNKNOWN');
    expect(state.verifiedGrossTotal.amount).toBe('0.000000');
    expect(state.dateUnknownGross.amount).toBe('8689.000000');
    expect(state.slices[0]?.verification).toBe('date_unknown');
    expect(state.slices[0]?.actualPaidAt).toBeNull();
  });

  it('resolveVerifiedInstallmentPayments for cellular-like row', () => {
    const resolved = resolveVerifiedInstallmentPayments({
      grossAmount: '8450.000000',
      currency: 'ILS',
      installmentCount: 24,
      installmentStartDate: '2026-03-01',
      expenseDate: '2026-03-01',
      cashInstallmentSchedule: null,
      installmentsPaidCount: 1,
      paidGrossAmount: '352.080000',
      paidAt: '2026-03-01',
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
