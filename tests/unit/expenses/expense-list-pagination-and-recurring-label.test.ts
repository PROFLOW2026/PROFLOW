import { describe, expect, it } from 'vitest';
import {
  EXPENSE_LIST_PAGE_SIZE,
  expenseListOffset,
  expenseListPageCount,
  resolveExpenseListPage,
} from '@/modules/expenses/domain/expense-list-pagination';
import { resolveExpenseDisplayDescription, expenseListLabel } from '@/modules/expenses/ui/expense-list-label';

describe('expense list pagination', () => {
  it('uses page size 50 and stable offsets', () => {
    expect(EXPENSE_LIST_PAGE_SIZE).toBe(50);
    expect(expenseListOffset(1)).toBe(0);
    expect(expenseListOffset(2)).toBe(50);
    expect(expenseListPageCount(120)).toBe(3);
  });

  it('clamps out-of-range pages safely', () => {
    expect(resolveExpenseListPage(120, 99)).toBe(3);
    expect(resolveExpenseListPage(0, 5)).toBe(1);
  });
});

describe('recurring expense display name fallback', () => {
  it('prefers stored description then recurring template title', () => {
    expect(
      resolveExpenseDisplayDescription({
        description: '  Direct name  ',
        recurringSourceTitle: 'Template title',
      }),
    ).toBe('Direct name');
    expect(
      resolveExpenseDisplayDescription({
        description: null,
        recurringSourceTitle: 'ביטוח ישיר',
      }),
    ).toBe('ביטוח ישיר');
  });

  it('does not show no-description when recurring title exists', () => {
    const label = expenseListLabel(
      {
        description: null,
        supplierName: null,
        voidsExpenseId: null,
        adjustsExpenseId: null,
        recurringSourceTitle: 'ביטוח ישיר',
      },
      (key) => (key === 'list.noDescription' ? 'ללא תיאור' : key),
    );
    expect(label).toBe('ביטוח ישיר');
  });
});
