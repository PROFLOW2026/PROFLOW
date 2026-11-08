import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { planRecordedVendorPaymentAmount } from '@/modules/ap/domain/vendor-payment-amount';

describe('planRecordedVendorPaymentAmount', () => {
  it('keeps a single application on the same payment', () => {
    expect(planRecordedVendorPaymentAmount(['app-1'])).toEqual({ applicationId: 'app-1' });
  });

  it('allows a recorded payment that has no application row', () => {
    expect(planRecordedVendorPaymentAmount([])).toEqual({ applicationId: null });
  });

  it('refuses to split a payment that is applied to several bills', () => {
    expect(() => planRecordedVendorPaymentAmount(['app-1', 'app-2'])).toThrow(DomainRuleError);
    try {
      planRecordedVendorPaymentAmount(['app-1', 'app-2']);
    } catch (error) {
      expect(error).toMatchObject({ messageKey: 'ap.errors.paymentCorrectionMultiApply' });
    }
  });
});
