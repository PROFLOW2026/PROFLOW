import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertAcceptMatchDoesNotCreateExpense,
  assertMatchCurrencyIntegrity,
  assertMatchDoesNotOverMatch,
  assertMatchExpenseAmountWithinExpense,
  assertMatchHasTarget,
  computeMatchVariance,
  deriveBillStatusFromAcceptedMatches,
  isAcceptingMatchCreatingExpense,
  remainingUnmatchedAmount,
} from '@/modules/ap/domain/matching';

describe('AP matching domain rules', () => {
  it('requires PO and/or existing expense as match target', () => {
    expect(() => assertMatchHasTarget({})).toThrow(DomainRuleError);
    expect(() => assertMatchHasTarget({ purchaseOrderId: null, expenseId: null })).toThrow(
      DomainRuleError,
    );
    expect(() => assertMatchHasTarget({ purchaseOrderId: 'po-1' })).not.toThrow();
    expect(() => assertMatchHasTarget({ expenseId: 'exp-1' })).not.toThrow();
    expect(() =>
      assertMatchHasTarget({ purchaseOrderId: 'po-1', expenseId: 'exp-1' }),
    ).not.toThrow();
  });

  it('never treats accepting a match as creating an expense', () => {
    expect(isAcceptingMatchCreatingExpense()).toBe(false);
    expect(() => assertAcceptMatchDoesNotCreateExpense()).not.toThrow();
  });

  it('derives partial and full match status from accepted amounts', () => {
    expect(
      deriveBillStatusFromAcceptedMatches({
        currency: 'ILS',
        billTotal: '100',
        acceptedMatchedAmounts: [],
        currentStatus: 'open',
      }),
    ).toBe('open');

    expect(
      deriveBillStatusFromAcceptedMatches({
        currency: 'ILS',
        billTotal: '100',
        acceptedMatchedAmounts: ['40'],
        currentStatus: 'open',
      }),
    ).toBe('partially_matched');

    expect(
      deriveBillStatusFromAcceptedMatches({
        currency: 'ILS',
        billTotal: '100',
        acceptedMatchedAmounts: ['60', '40'],
        currentStatus: 'partially_matched',
      }),
    ).toBe('matched');

    expect(
      deriveBillStatusFromAcceptedMatches({
        currency: 'ILS',
        billTotal: '100',
        acceptedMatchedAmounts: ['100'],
        currentStatus: 'void',
      }),
    ).toBe('void');
  });

  it('computes remaining unmatched amount for partial matching', () => {
    const remaining = remainingUnmatchedAmount({
      currency: 'ILS',
      billTotal: '100.00',
      reservedMatchedAmounts: ['25', '10'],
    });
    expect(remaining.amount).toBe('65.000000');
    expect(remaining.currency).toBe('ILS');

    const noneLeft = remainingUnmatchedAmount({
      currency: 'ILS',
      billTotal: '100',
      reservedMatchedAmounts: ['100'],
    });
    expect(noneLeft.amount).toBe('0.000000');
  });

  it('rejects over-match against reserved capacity', () => {
    expect(() =>
      assertMatchDoesNotOverMatch({
        currency: 'ILS',
        billTotal: '100',
        reservedMatchedAmounts: ['60', '30'],
        additionalMatchedAmount: '20',
      }),
    ).toThrow(DomainRuleError);

    expect(() =>
      assertMatchDoesNotOverMatch({
        currency: 'ILS',
        billTotal: '100',
        reservedMatchedAmounts: ['60'],
        additionalMatchedAmount: '40',
      }),
    ).not.toThrow();
  });

  it('exposes variance when accepted sum diverges from bill total', () => {
    const partial = computeMatchVariance({
      currency: 'USD',
      billTotal: '200',
      acceptedMatchedAmounts: ['50', '25'],
    });
    expect(partial.isPartiallyMatched).toBe(true);
    expect(partial.isFullyMatched).toBe(false);
    expect(partial.remainingUnmatched).toBe('125.000000');
    expect(partial.hasOverMatchVariance).toBe(false);

    const over = computeMatchVariance({
      currency: 'USD',
      billTotal: '200',
      acceptedMatchedAmounts: ['250'],
    });
    expect(over.hasOverMatchVariance).toBe(true);
    expect(over.overMatchVariance).toBe('50.000000');
  });

  it('rejects expense match above expense gross (R-040)', () => {
    expect(() =>
      assertMatchExpenseAmountWithinExpense({
        currency: 'ILS',
        expenseGrossAmount: '100',
        matchedAmount: '150',
      }),
    ).toThrow(DomainRuleError);
    expect(() =>
      assertMatchExpenseAmountWithinExpense({
        currency: 'ILS',
        expenseGrossAmount: '100',
        matchedAmount: '100',
      }),
    ).not.toThrow();
  });

  it('enforces currency integrity across bill, match, PO, and expense', () => {
    expect(() =>
      assertMatchCurrencyIntegrity({
        billCurrency: 'ILS',
        matchCurrency: 'USD',
      }),
    ).toThrow(DomainRuleError);

    expect(() =>
      assertMatchCurrencyIntegrity({
        billCurrency: 'ILS',
        matchCurrency: 'ILS',
        purchaseOrderCurrency: 'USD',
      }),
    ).toThrow(DomainRuleError);

    expect(() =>
      assertMatchCurrencyIntegrity({
        billCurrency: 'ils',
        matchCurrency: 'ILS',
        purchaseOrderCurrency: 'ILS',
        expenseCurrency: 'ILS',
      }),
    ).not.toThrow();
  });
});
