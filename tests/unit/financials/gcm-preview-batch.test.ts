import { describe, expect, it } from 'vitest';
import { money, zeroMoney } from '@/shared/money';
import { previewAllocationFromPreparedInputs } from '@/modules/financials/application/preview-general-cost-month';

const ILS = 'ILS';

describe('batched GCM preview allocation', () => {
  it('allocates many months from one basis without changing per-month math', () => {
    const bases = [
      { projectId: 'a', directActual: money('75000', ILS) },
      { projectId: 'b', directActual: money('25000', ILS) },
    ];
    const months = ['2026-09', '2026-10', '2027-01', '2028-02'];
    const pool = money('1000', ILS);
    const previews = months.map((yearMonth) =>
      previewAllocationFromPreparedInputs({
        yearMonth,
        currency: ILS,
        timezone: 'Asia/Jerusalem',
        allowFuture: true,
        existing: null,
        monthClosed: false,
        sources: [{ kind: 'expense_unallocated', amount: pool, label: 'expense_unallocated' }],
        bases,
      }),
    );

    expect(previews.every((row) => !row.skipped)).toBe(true);
    const projectA = previews.map((row) => Number(row.lines.find((l) => l.projectId === 'a')?.amount.amount));
    expect(new Set(projectA).size).toBe(1);
    expect(projectA[0]).toBeCloseTo(750, 2);
  });

  it('skips empty pools without requiring a DB round trip', () => {
    const preview = previewAllocationFromPreparedInputs({
      yearMonth: '2026-11',
      currency: ILS,
      timezone: 'Asia/Jerusalem',
      allowFuture: true,
      existing: null,
      monthClosed: false,
      sources: [],
      bases: [{ projectId: 'a', directActual: money('1', ILS) }],
    });
    expect(preview.skipped).toBe(true);
    expect(preview.reason).toBe('no_pool');
    expect(preview.lines).toEqual([]);
    expect(zeroMoney(ILS).amount).toBe(preview.poolAmount.amount);
  });
});
