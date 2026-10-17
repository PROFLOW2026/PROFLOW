import { describe, expect, it, vi } from 'vitest';
import {
  loadExpensePaymentAuditsByExpenseIds,
  normalizePaymentAuditAfter,
} from '@/modules/expenses/data/expense-installment-payments.repository';
import { resolveInstallmentPaymentState } from '@/modules/expenses/domain/expense-installment-payment-evidence';
import { recognizedExpenseNetInYearMonth } from '@/modules/expenses/domain/installment-payment-recognition';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';
import type { DbExecutor } from '@/shared/db/types';

describe('normalizePaymentAuditAfter', () => {
  it('coerces a textual installment index into a number', () => {
    expect(
      normalizePaymentAuditAfter({
        paidAt: '2026-03-01',
        paidGrossAmount: '724.08',
        installmentIndex: '2',
        source: 'manual',
      }),
    ).toMatchObject({
      paidAt: '2026-03-01',
      paidGrossAmount: '724.08',
      installmentIndex: 2,
    });
  });
});

function mockDbWithTransaction(inner: DbExecutor): DbExecutor {
  return {
    transaction: async <T>(fn: (tx: DbExecutor) => Promise<T>) => fn(inner),
  } as unknown as DbExecutor;
}

describe('loadExpensePaymentAuditsByExpenseIds', () => {
  it('does not query when there are no expenses', async () => {
    const select = vi.fn();
    const result = await loadExpensePaymentAuditsByExpenseIds(
      mockDbWithTransaction({ select } as unknown as DbExecutor),
      '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec',
      [],
    );
    expect(result.size).toBe(0);
    expect(select).not.toHaveBeenCalled();
  });

  it('keeps callers usable when the audit statement fails (nested TX / SAVEPOINT)', async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockRejectedValue(
        Object.assign(new Error('Failed query: select from audit_events'), {
          cause: Object.assign(new Error('cannot cast type text[] to uuid[]'), { code: '42846' }),
        }),
      ),
    };
    const select = vi.fn().mockReturnValue(chain);

    const result = await loadExpensePaymentAuditsByExpenseIds(
      mockDbWithTransaction({ select } as unknown as DbExecutor),
      '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec',
      ['bbd3cdce-22e5-477f-bae1-1161e87cacb6'],
    );

    expect(result.size).toBe(0);
    expect(select).toHaveBeenCalled();
  });

  it('does not invent verified month recognition when audits are empty and only paidGross exists', () => {
    const resolution = resolveInstallmentPaymentState({
      grossAmount: '8689',
      currency: 'ILS',
      installmentCount: 12,
      installmentStartDate: '2026-01-01',
      expenseDate: '2026-01-01',
      cashInstallmentSchedule: null,
      installmentsPaidCount: 9,
      paidGrossAmount: '6516.72',
      paidAt: '2026-09-01',
      audits: [],
      ledgerSlices: [],
    });
    expect(resolution.status).toBe('PAID_DATE_UNKNOWN');
    expect(Number(resolution.verifiedGrossTotal.amount)).toBe(0);
    const recognized = recognizedExpenseNetInYearMonth(
      {
        netAmount: '7363.56',
        grossAmount: '8689',
        taxAmount: '1325.44',
        currency: 'ILS',
        expenseDate: '2026-01-01',
        installmentCount: 12,
        installmentStartDate: '2026-01-01',
        installmentsPaidCount: 9,
        paidGrossAmount: '6516.72',
        paidAt: '2026-09-01',
        cashInstallmentSchedule: null,
        verifiedInstallmentPayments: [],
        dateUnknownGross: resolution.dateUnknownGross.amount,
        installmentPaymentStatus: resolution.status,
      },
      '2026-03',
    );
    expect(recognized).toBeNull();
  });

  it('still recognizes verified ledger slices when audits are empty after a soft failure', () => {
    const ledgerSlices = [
      {
        installmentIndex: 2,
        dueDate: businessDate('2026-03-01'),
        actualPaidAt: businessDate('2026-03-01'),
        grossPaid: money('724.08', 'ILS'),
        verification: 'verified' as const,
        source: 'ledger' as const,
      },
    ];
    const resolution = resolveInstallmentPaymentState({
      grossAmount: '8689',
      currency: 'ILS',
      installmentCount: 12,
      installmentStartDate: '2026-01-01',
      expenseDate: '2026-01-01',
      cashInstallmentSchedule: null,
      installmentsPaidCount: 1,
      paidGrossAmount: '724.08',
      paidAt: '2026-03-01',
      audits: [],
      ledgerSlices,
    });
    expect(resolution.slices.some((slice) => slice.source === 'ledger')).toBe(true);
    expect(Number(resolution.verifiedGrossTotal.amount)).toBeGreaterThan(0);
    const recognized = recognizedExpenseNetInYearMonth(
      {
        netAmount: '7363.56',
        grossAmount: '8689',
        taxAmount: '1325.44',
        currency: 'ILS',
        expenseDate: '2026-01-01',
        installmentCount: 12,
        installmentStartDate: '2026-01-01',
        installmentsPaidCount: 1,
        paidGrossAmount: '724.08',
        paidAt: '2026-03-01',
        cashInstallmentSchedule: null,
        verifiedInstallmentPayments: resolution.slices.filter(
          (slice) => slice.verification === 'verified' && slice.actualPaidAt != null,
        ),
        dateUnknownGross: resolution.dateUnknownGross.amount,
        installmentPaymentStatus: resolution.status,
      },
      '2026-03',
    );
    expect(recognized).not.toBeNull();
    expect(Number(recognized!.amount)).toBeGreaterThan(0);
  });

  it('maps a successful read onto the employee expense', async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([
        {
          entityId: 'bbd3cdce-22e5-477f-bae1-1161e87cacb6',
          action: 'expense.payment_confirmed',
          createdAt: '2026-03-01T00:00:00.000Z',
          after: {
            paidAt: '2026-03-01',
            paidGrossAmount: '724.08',
            installmentIndex: '2',
            source: 'ledger',
          },
        },
      ]),
    };
    const select = vi.fn().mockReturnValue(chain);

    const result = await loadExpensePaymentAuditsByExpenseIds(
      mockDbWithTransaction({ select } as unknown as DbExecutor),
      '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec',
      ['bbd3cdce-22e5-477f-bae1-1161e87cacb6'],
    );
    const row = result.get('bbd3cdce-22e5-477f-bae1-1161e87cacb6')?.[0];
    expect(row?.action).toBe('expense.payment_confirmed');
    expect(row?.createdAt).toBe('2026-03-01T00:00:00.000Z');
    expect(row?.after).toMatchObject({ installmentIndex: 2, paidGrossAmount: '724.08' });
  });
});
