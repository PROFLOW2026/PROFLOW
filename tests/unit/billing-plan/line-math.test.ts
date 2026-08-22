import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { money, toNumericString } from '@/shared/money';
import {
  allocateFinalSlice,
  assertWithinLineCap,
  computeCumulative,
  computeRemaining,
  deriveAmountFromPercent,
  derivePercentFromAmount,
} from '@/modules/billing-plan/domain/line-math';

const ILS = 'ILS';

describe('billing-plan line-math', () => {
  // A — simple percent of base
  it('A: derives amount from a simple percent', () => {
    const base = money('100000', ILS);
    const amount = deriveAmountFromPercent(base, '25');
    expect(toNumericString(amount)).toBe('25000.000000');
  });

  // B — amount ↔ percent round-trip
  it('B: converts amount ↔ percent symmetrically', () => {
    const base = money('200000', ILS);
    const amount = money('50000', ILS);
    const percent = derivePercentFromAmount(base, amount);
    expect(percent).toBe('25.00000000');
    const back = deriveAmountFromPercent(base, percent);
    expect(toNumericString(back)).toBe('50000.000000');
  });

  // C — partials / cumulative / remaining
  it('C: tracks partials with cumulative and remaining', () => {
    const base = money('100000', ILS);
    const prior = money('30000', ILS);
    const current = money('20000', ILS);
    const cumulative = computeCumulative(prior, current);
    const remaining = computeRemaining(base, cumulative);
    expect(toNumericString(cumulative)).toBe('50000.000000');
    expect(toNumericString(remaining)).toBe('50000.000000');
    expect(derivePercentFromAmount(base, cumulative)).toBe('50.00000000');
  });

  // D — overbill blocked
  it('D: rejects overbilling beyond the agreed line cap', () => {
    const base = money('100000', ILS);
    const prior = money('90000', ILS);
    const current = money('15000', ILS);
    expect(() => assertWithinLineCap(base, prior, current)).toThrow(DomainRuleError);
    try {
      assertWithinLineCap(base, prior, current);
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError);
      expect((error as DomainRuleError).messageKey).toBe('billingPlan.errors.overbill');
    }
  });

  // F — rounding with repeating percent 33.3333%
  it('F: rounds repeating 33.3333% with decimal precision (no float drift)', () => {
    const base = money('100000', ILS);
    const a = deriveAmountFromPercent(base, '33.3333');
    const b = deriveAmountFromPercent(base, '33.3333');
    const c = deriveAmountFromPercent(base, '33.3334');
    const sum = computeCumulative(computeCumulative(a, b), c);
    // 33.3333 + 33.3333 + 33.3334 = 100 exactly on the percent side;
    // amounts should re-sum without inventing float noise.
    expect(toNumericString(a)).toBe('33333.300000');
    expect(toNumericString(b)).toBe('33333.300000');
    expect(toNumericString(c)).toBe('33333.400000');
    expect(toNumericString(sum)).toBe('100000.000000');
  });

  it('allocates the exact remaining slice when closing near 100%', () => {
    const base = money('1000.00', ILS);
    const prior = money('999.99', ILS);
    const slice = allocateFinalSlice({
      base,
      priorAmount: prior,
      requestedPercent: '0.01',
      closePercentTolerance: '0.01',
    });
    expect(slice.closedExactly).toBe(true);
    expect(toNumericString(slice.currentAmount)).toBe('0.010000');
    expect(toNumericString(slice.cumulativeAmount)).toBe('1000.000000');
    expect(toNumericString(slice.remainingAmount)).toBe('0.000000');
  });

  it('allocateFinalSlice with closeRemainder-style full remaining request', () => {
    const base = money('10000', ILS);
    const prior = money('7500', ILS);
    const slice = allocateFinalSlice({
      base,
      priorAmount: prior,
      requestedAmount: '2500',
    });
    expect(toNumericString(slice.currentAmount)).toBe('2500.000000');
    expect(toNumericString(slice.remainingAmount)).toBe('0.000000');
    expect(slice.cumulativePercent).toBe('100.00000000');
  });
});
