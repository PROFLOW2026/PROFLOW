import { describe, expect, it } from 'vitest';
import {
  collectExpenseApOverlapWarnings,
  expenseRemainingAfterMatches,
  findSimilarFinalizedExpensesForBill,
  findSimilarOpenApBillsForExpense,
} from '@/modules/financials/domain/expense-ap-overlap';

const ILS = 'ILS';

describe('expense-ap overlap warnings', () => {
  it('finds finalized expenses similar to a new bill', () => {
    const hits = findSimilarFinalizedExpensesForBill(
      {
        vendorId: 'v1',
        projectId: 'p1',
        totalAmount: '6000',
        currency: ILS,
      },
      [
        {
          id: 'e1',
          vendorId: 'v1',
          projectId: 'p1',
          netAmount: '10000',
          currency: ILS,
          description: 'Materials',
          matchedAmount: '0',
        },
        {
          id: 'e2',
          vendorId: 'v2',
          projectId: 'p1',
          netAmount: '6000',
          currency: ILS,
          description: 'Other vendor',
          matchedAmount: '0',
        },
      ],
    );
    expect(hits.map((row) => row.id)).toEqual(['e1']);
  });

  it('ignores expenses fully covered by accepted matches', () => {
    const hits = findSimilarFinalizedExpensesForBill(
      {
        vendorId: 'v1',
        projectId: 'p1',
        totalAmount: '6000',
        currency: ILS,
      },
      [
        {
          id: 'e1',
          vendorId: 'v1',
          projectId: 'p1',
          netAmount: '6000',
          currency: ILS,
          description: 'Already matched',
          matchedAmount: '6000',
        },
      ],
    );
    expect(hits).toHaveLength(0);
  });

  it('finds open AP bills similar to a new expense', () => {
    const hits = findSimilarOpenApBillsForExpense(
      {
        vendorId: 'v1',
        projectId: 'p1',
        netAmount: '9200',
        currency: ILS,
      },
      [
        {
          id: 'b1',
          vendorId: 'v1',
          projectId: 'p1',
          netAmount: '9200',
          currency: ILS,
          reference: 'INV-1',
          status: 'open',
        },
      ],
    );
    expect(hits.map((row) => row.id)).toEqual(['b1']);
  });

  it('F12: unlinked lookalike returns warning instead of throwing (OD-01)', () => {
    expect(
      collectExpenseApOverlapWarnings({
        hitCount: 1,
        messageKey: 'expenses.errors.unlinkedApOverlap',
      }),
    ).toEqual([{ hitCount: 1, messageKey: 'expenses.errors.unlinkedApOverlap' }]);
    expect(
      collectExpenseApOverlapWarnings({
        hitCount: 1,
        confirmDistinctCosts: true,
        messageKey: 'expenses.errors.unlinkedApOverlap',
      }),
    ).toEqual([]);
    expect(
      collectExpenseApOverlapWarnings({
        hitCount: 0,
        messageKey: 'expenses.errors.unlinkedApOverlap',
      }),
    ).toEqual([]);
  });

  it('F06: expense remaining after GROSS match uses NET equivalent', () => {
    expect(
      expenseRemainingAfterMatches({
        id: 'e1',
        vendorId: 'v1',
        projectId: 'p1',
        netAmount: '20000',
        grossAmount: '23600',
        currency: ILS,
        description: null,
        matchedAmount: '11800',
      }),
    ).toBe('10000.000000');
  });
});
