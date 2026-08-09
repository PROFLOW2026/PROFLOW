import { describe, expect, it } from 'vitest';
import {
  excludeCommittedFromActualCost,
  isCommittedCostActualExpense,
  shouldCreateCommittedCostOnIssue,
} from '@/modules/procurement/domain/committed-cost';

describe('CommittedCost != Expense', () => {
  it('never treats committed cost as actual expense', () => {
    expect(isCommittedCostActualExpense()).toBe(false);
  });

  it('creates committed cost on issue statuses only', () => {
    expect(shouldCreateCommittedCostOnIssue('draft')).toBe(false);
    expect(shouldCreateCommittedCostOnIssue('issued')).toBe(true);
    expect(shouldCreateCommittedCostOnIssue('cancelled')).toBe(false);
  });

  it('keeps actual cost independent of open commitments', () => {
    expect(
      excludeCommittedFromActualCost({
        actualExpenseTotal: '200',
        committedOpenTotal: '500',
      }),
    ).toEqual({ actualCost: '200', committedOnly: '500' });
  });
});
