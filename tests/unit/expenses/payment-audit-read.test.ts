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

function queryText(query: unknown): string {
  return JSON.stringify(query);
}

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

describe('loadExpensePaymentAuditsByExpenseIds', () => {
  it('does not query when there are no expenses', async () => {
    const execute = vi.fn();
    const result = await loadExpensePaymentAuditsByExpenseIds(
      { execute } as unknown as DbExecutor,
      '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec',
      [],
    );
    expect(result.size).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps the transaction usable when the audit statement fails', async () => {
    const seen: string[] = [];
    const execute = vi.fn(async (query: unknown) => {
      const text = queryText(query);
      seen.push(text);
      if (text.includes('SAVEPOINT') || text.includes('ROLLBACK') || text.includes('RELEASE')) {
        return undefined;
      }
      const error = new Error('Failed query: select from audit_events');
      error.cause = Object.assign(new Error('operator does not exist: uuid = text'), {
        code: '42883',
      });
      throw error;
    });

    const result = await loadExpensePaymentAuditsByExpenseIds(
      { execute } as unknown as DbExecutor,
      '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec',
      ['bbd3cdce-22e5-477f-bae1-1161e87cacb6'],
    );

    expect(result.size).toBe(0);
    expect(seen.some((text) => text.includes('ROLLBACK TO SAVEPOINT'))).toBe(true);
    expect(seen.some((text) => text.includes('::uuid'))).toBe(true);
    expect(seen.some((text) => text.includes('::text[]'))).toBe(true);
    expect(seen.some((text) => /ARRAY\[/.test(text))).toBe(true);
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
    const execute = vi.fn(async (query: unknown) => {
      const text = queryText(query);
      if (!text.includes('audit_events')) return undefined;
      return [
        {
          entity_id: 'bbd3cdce-22e5-477f-bae1-1161e87cacb6',
          action: 'expense.payment_confirmed',
          created_at: '2026-03-01T00:00:00.000Z',
          after: {
            paidAt: '2026-03-01',
            paidGrossAmount: '724.08',
            installmentIndex: '2',
            source: 'ledger',
          },
        },
      ];
    });

    const result = await loadExpensePaymentAuditsByExpenseIds(
      { execute } as unknown as DbExecutor,
      '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec',
      ['bbd3cdce-22e5-477f-bae1-1161e87cacb6'],
    );
    const row = result.get('bbd3cdce-22e5-477f-bae1-1161e87cacb6')?.[0];
    expect(row?.action).toBe('expense.payment_confirmed');
    expect(row?.createdAt).toBe('2026-03-01T00:00:00.000Z');
    expect(row?.after).toMatchObject({ installmentIndex: 2, paidGrossAmount: '724.08' });
  });
});
