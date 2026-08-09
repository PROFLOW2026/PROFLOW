import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertCommittedAmountMatchesLines,
  assertIssueCreatesCommittedNotExpense,
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

  it('guards issue path: committed yes, expense never', () => {
    expect(() => assertIssueCreatesCommittedNotExpense('issued')).not.toThrow();
    expect(() => assertIssueCreatesCommittedNotExpense('draft')).toThrow(DomainRuleError);
  });

  it('requires committed header to equal line totals via money helpers', () => {
    expect(() =>
      assertCommittedAmountMatchesLines({
        currency: 'ILS',
        committedAmount: '150',
        lines: [
          { lineTotal: '100', currency: 'ILS' },
          { lineTotal: '50', currency: 'ILS' },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      assertCommittedAmountMatchesLines({
        currency: 'ILS',
        committedAmount: '100',
        lines: [
          { lineTotal: '100', currency: 'ILS' },
          { lineTotal: '50', currency: 'ILS' },
        ],
      }),
    ).toThrow(/equal the sum/i);

    expect(() =>
      assertCommittedAmountMatchesLines({
        currency: 'ILS',
        committedAmount: '100',
        lines: [{ lineTotal: '100', currency: 'USD' }],
      }),
    ).toThrow(/currency/i);
  });

  it('keeps actual cost independent of open commitments', () => {
    expect(
      excludeCommittedFromActualCost({
        actualExpenseTotal: '200',
        committedOpenTotal: '500',
        currency: 'ILS',
      }),
    ).toEqual({ actualCost: '200.000000', committedOnly: '500.000000' });
  });
});
