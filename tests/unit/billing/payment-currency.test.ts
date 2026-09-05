import { describe, expect, it } from 'vitest';

import { assertCustomerPaymentCurrencyMatch } from '@/modules/billing/domain/payment-applications';
import { DomainRuleError } from '@/shared/errors';

describe('payment currency integrity', () => {
  it('rejects invoice currency that does not match payment currency', () => {
    expect(() => assertCustomerPaymentCurrencyMatch('ILS', 'USD')).toThrow(DomainRuleError);
    try {
      assertCustomerPaymentCurrencyMatch('ILS', 'USD');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError);
      expect((error as DomainRuleError).messageKey).toBe('billing.errors.paymentCurrencyMismatch');
    }
  });

  it('allows matching currencies case-insensitively', () => {
    expect(() => assertCustomerPaymentCurrencyMatch('ils', 'ILS')).not.toThrow();
  });
});
