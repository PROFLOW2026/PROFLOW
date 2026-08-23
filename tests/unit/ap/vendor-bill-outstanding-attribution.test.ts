import { describe, expect, it } from 'vitest';
import { scaleBillOutstandingToProjectSlice } from '@/modules/ap/domain/vendor-bill-project-attribution';
import { money, zeroMoney } from '@/shared/money';

describe('scaleBillOutstandingToProjectSlice (R-020)', () => {
  it('attributes half of bill outstanding to a 50% project slice', () => {
    const slice = scaleBillOutstandingToProjectSlice({
      currency: 'ILS',
      billNetAmount: '1000',
      sliceAmount: '500',
      billOutstanding: money('200', 'ILS'),
    });
    expect(slice).toEqual(money('100', 'ILS'));
  });

  it('returns zero when slice is zero', () => {
    expect(
      scaleBillOutstandingToProjectSlice({
        currency: 'ILS',
        billNetAmount: '1000',
        sliceAmount: '0',
        billOutstanding: money('200', 'ILS'),
      }),
    ).toEqual(zeroMoney('ILS'));
  });
});
