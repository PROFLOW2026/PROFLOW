import { describe, expect, it } from 'vitest';
import { reverseChangeOrderBlockReason } from '@/modules/commercial/domain/change-order-reversal';
import {
  changeOrderEventAmount,
  oppositeChangeDirection,
} from '@/modules/commercial/domain/contract-value';
import { money } from '@/shared/money/money';

const CURRENCY = 'ILS';

describe('change order commercial reversal', () => {
  it('uses the opposite direction and signed event amount', () => {
    expect(oppositeChangeDirection('addition')).toBe('reduction');
    expect(oppositeChangeDirection('reduction')).toBe('addition');

    const magnitude = money('12000', CURRENCY);
    expect(changeOrderEventAmount('addition', magnitude)).toEqual(money('12000', CURRENCY));
    expect(changeOrderEventAmount(oppositeChangeDirection('addition'), magnitude)).toEqual(
      money('-12000', CURRENCY),
    );
    expect(changeOrderEventAmount(oppositeChangeDirection('reduction'), magnitude)).toEqual(
      money('12000', CURRENCY),
    );
  });

  it('cannot reverse a reversing change order', () => {
    expect(
      reverseChangeOrderBlockReason({
        original: { reversalOfChangeOrderId: 'co-original' },
        existingReversalId: null,
      }),
    ).toBe('is_reversal');
  });

  it('cannot reverse the same change order twice', () => {
    expect(
      reverseChangeOrderBlockReason({
        original: { reversalOfChangeOrderId: null },
        existingReversalId: 'co-reversal',
      }),
    ).toBe('already_reversed');
  });

  it('allows reversing an original change order that has no reversal yet', () => {
    expect(
      reverseChangeOrderBlockReason({
        original: { reversalOfChangeOrderId: null },
        existingReversalId: null,
      }),
    ).toBeNull();
  });
});
