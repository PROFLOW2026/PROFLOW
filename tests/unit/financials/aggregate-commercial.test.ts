import { describe, expect, it } from 'vitest';
import { addCommercialPositions, sumCommercialPositions } from '@/modules/financials/domain/aggregate-commercial';
import { money } from '@/shared/money';
import type { CommercialPosition } from '@/modules/financials/domain/types';

function position(amount: string): CommercialPosition {
  const value = money(amount, 'ILS');
  const zero = money('0', 'ILS');
  return {
    originalContractValue: value,
    approvedAdditions: zero,
    approvedReductions: zero,
    currentContractValue: value,
    pendingChanges: zero,
  };
}

describe('sumCommercialPositions', () => {
  it('adds current contract values from two contracts', () => {
    const sum = addCommercialPositions(position('100'), position('50'));
    expect(sum.currentContractValue.amount).toBe('150.000000');
    expect(sumCommercialPositions([position('100'), position('50')], 'ILS').currentContractValue.amount).toBe(
      '150.000000',
    );
  });
});
