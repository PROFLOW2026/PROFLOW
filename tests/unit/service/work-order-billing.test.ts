import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { composeWorkOrderBillingAmount } from '@/modules/service/domain/work-order-billing';

describe('composeWorkOrderBillingAmount', () => {
  it('composes labor, materials, call-out and additional charges', () => {
    const result = composeWorkOrderBillingAmount({
      currency: 'ils',
      laborHours: '2',
      laborRate: '100',
      materialsAmount: '50',
      callOutFee: '80',
      additionalCharges: '20',
      discountAmount: '10',
    });

    expect(result.currency).toBe('ILS');
    expect(result.laborAmount.amount).toBe('200.000000');
    expect(result.netAmount.amount).toBe('340.000000');
  });

  it('rejects a discount larger than charges', () => {
    expect(() =>
      composeWorkOrderBillingAmount({
        currency: 'ILS',
        materialsAmount: '10',
        discountAmount: '11',
      }),
    ).toThrow(DomainRuleError);
  });

  it('treats empty lines as zero', () => {
    const result = composeWorkOrderBillingAmount({
      currency: 'ILS',
      laborHours: '',
      materialsAmount: '25',
    });
    expect(result.laborAmount.amount).toBe('0.000000');
    expect(result.netAmount.amount).toBe('25.000000');
  });
});
