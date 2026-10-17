import { describe, expect, it, vi } from 'vitest';
import {
  loadExpensePaymentAuditsByExpenseIds,
  normalizePaymentAuditAfter,
} from '@/modules/expenses/data/expense-installment-payments.repository';
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
    expect(seen.some((text) => text.includes('::uuid[]'))).toBe(true);
    expect(seen.some((text) => text.includes('::text[]'))).toBe(true);
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
