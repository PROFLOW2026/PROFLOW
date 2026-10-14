import { describe, expect, it } from 'vitest';
import {
  resolveVerifiedInstallmentPayments,
} from '@/modules/expenses/domain/expense-installment-payment-evidence';
import { recognizedExpenseNetInYearMonth } from '@/modules/expenses/domain/installment-payment-recognition';

const ILS = 'ILS';

describe('F04 — installment void / duplicate confirm', () => {
  const scheduleBase = {
    grossAmount: '14160.000000',
    netAmount: '12000.000000',
    currency: ILS,
    installmentCount: 12,
    installmentStartDate: '2026-01-01',
    expenseDate: '2026-01-01',
    cashInstallmentSchedule: null,
    installmentsPaidCount: 0,
    paidGrossAmount: '0',
    paidAt: null,
  };

  it('void after confirm removes March recognition', () => {
    const verified = resolveVerifiedInstallmentPayments({
      ...scheduleBase,
      installmentsPaidCount: 1,
      paidGrossAmount: '1180.000000',
      paidAt: '2026-03-15',
      audits: [
        {
          action: 'expense.payment_confirmed',
          createdAt: '2026-03-15T10:00:00.000Z',
          after: {
            paidAt: '2026-03-15',
            paidGrossAmount: '1180.000000',
            installmentIndex: 0,
          },
        },
        {
          action: 'expense.payment_confirmation_voided',
          createdAt: '2026-03-16T10:00:00.000Z',
          after: null,
        },
      ],
    });
    const net = recognizedExpenseNetInYearMonth(
      {
        ...scheduleBase,
        verifiedInstallmentPayments: verified,
      },
      '2026-03',
    );
    expect(net).toBeNull();
  });

  it('duplicate confirm for same installment index counts once', () => {
    const verified = resolveVerifiedInstallmentPayments({
      ...scheduleBase,
      installmentsPaidCount: 1,
      paidGrossAmount: '1180.000000',
      paidAt: '2026-03-15',
      audits: [
        {
          action: 'expense.payment_confirmed',
          createdAt: '2026-03-15T10:00:00.000Z',
          after: {
            paidAt: '2026-03-15',
            paidGrossAmount: '1180.000000',
            installmentIndex: 0,
          },
        },
        {
          action: 'expense.payment_confirmed',
          createdAt: '2026-03-15T11:00:00.000Z',
          after: {
            paidAt: '2026-03-15',
            paidGrossAmount: '1180.000000',
            installmentIndex: 0,
          },
        },
      ],
    });
    expect(verified).toHaveLength(1);
    const net = recognizedExpenseNetInYearMonth(
      {
        ...scheduleBase,
        verifiedInstallmentPayments: verified,
      },
      '2026-03',
    );
    expect(Number(net?.amount)).toBeCloseTo(1000, 2);
  });

  it('ledger with no effective paid slice after void reversal yields no verified payments', () => {
    const verified = resolveVerifiedInstallmentPayments({
      ...scheduleBase,
      installmentsPaidCount: 0,
      paidGrossAmount: '0',
      paidAt: null,
      audits: [],
      ledgerSlices: [],
    });
    expect(verified).toHaveLength(0);
    const net = recognizedExpenseNetInYearMonth(
      {
        ...scheduleBase,
        verifiedInstallmentPayments: verified,
      },
      '2026-03',
    );
    expect(net).toBeNull();
  });
});
