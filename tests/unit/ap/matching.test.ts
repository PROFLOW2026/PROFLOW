import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertAcceptMatchDoesNotCreateExpense,
  assertMatchHasTarget,
  deriveBillStatusFromAcceptedMatches,
  isAcceptingMatchCreatingExpense,
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

  it('derives bill status from accepted matches without inventing expenses', () => {
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
});
