import { describe, expect, it } from 'vitest';
import { attachEntryBaselineContext } from '@/modules/financials';
import { money, zeroMoney } from '@/shared/money';

describe('commercial entry-baseline context', () => {
  const base = {
    originalContractValue: money('50000', 'ILS'),
    approvedAdditions: zeroMoney('ILS'),
    approvedReductions: zeroMoney('ILS'),
    currentContractValue: money('50000', 'ILS'),
    pendingChanges: zeroMoney('ILS'),
  };

  it('attaches display original and reduction when reduction is non-zero', () => {
    const position = attachEntryBaselineContext(base, {
      currency: 'ILS',
      displayOriginalNetAmount: '200000.000000',
      openingReductionNetAmount: '150000.000000',
    });

    expect(position.originalContractValue.amount).toBe('50000.000000');
    expect(position.displayOriginalContractValue?.amount).toBe('200000.000000');
    expect(position.openingReductionValue?.amount).toBe('150000.000000');
  });

  it('omits context when there is no opening reduction', () => {
    const position = attachEntryBaselineContext(base, {
      currency: 'ILS',
      displayOriginalNetAmount: null,
      openingReductionNetAmount: null,
    });

    expect(position.displayOriginalContractValue).toBeNull();
    expect(position.openingReductionValue).toBeNull();
    expect(position.originalContractValue.amount).toBe('50000.000000');
  });
});
