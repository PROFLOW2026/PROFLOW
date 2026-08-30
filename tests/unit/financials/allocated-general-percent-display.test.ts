import { describe, expect, it } from 'vitest';
import {
  formatPoolWeightPercent,
  informationalExpenseSharePercent,
  showsCanonicalPoolWeight,
  uniformPoolWeight,
} from '@/modules/financials/domain/allocated-general-percent-display';
import { money } from '@/shared/money';

describe('allocated general percent display', () => {
  it('formats pool weight to one decimal', () => {
    expect(formatPoolWeightPercent('37.3801')).toBe('37.4');
  });

  it('does not show canonical pool weight for manual_amount', () => {
    expect(showsCanonicalPoolWeight('manual_amount')).toBe(false);
    expect(showsCanonicalPoolWeight('direct_actual_weight')).toBe(true);
  });

  it('computes informational expense share for manual_amount only in UI layer', () => {
    expect(
      informationalExpenseSharePercent(money('3991.44', 'ILS'), money('12600', 'ILS')),
    ).toBe('31.7');
  });

  it('returns null uniform weight when monthly weights differ', () => {
    expect(
      uniformPoolWeight([
        { poolWeightPercent: '37.4' },
        { poolWeightPercent: '35.0' },
      ]),
    ).toBeNull();
  });

  it('returns shared weight when all monthly weights match', () => {
    expect(
      uniformPoolWeight([
        { poolWeightPercent: '37.3801' },
        { poolWeightPercent: '37.3801' },
      ]),
    ).toBe('37.4');
  });
});
