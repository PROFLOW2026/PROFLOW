import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import {
  assertBillingVatExplicitForFinalize,
  inferBillingVatModeForCapture,
  resolveTaxAmounts,
} from '@/modules/billing/domain/tax';

describe('billing VAT finalize invariant', () => {
  it('infers exclusive mode from net/tax overrides', () => {
    expect(
      inferBillingVatModeForCapture({
        netAmount: '1000',
        taxAmount: '180',
        resolvedTaxAmount: money('180', 'ILS'),
      }),
    ).toBe('exclusive');
  });

  it('rejects finalize when vat mode is missing', () => {
    expect(() =>
      assertBillingVatExplicitForFinalize({
        vatMode: null,
        subtotalAmount: money('100', 'ILS'),
        taxAmount: money('18', 'ILS'),
        totalAmount: money('118', 'ILS'),
      }),
    ).toThrow(/VAT mode is required/);
  });

  it('accepts explicit exclusive totals', () => {
    expect(() =>
      assertBillingVatExplicitForFinalize({
        vatMode: 'exclusive',
        subtotalAmount: money('100000', 'ILS'),
        taxAmount: money('18000', 'ILS'),
        totalAmount: money('118000', 'ILS'),
      }),
    ).not.toThrow();
  });

  it('zero mode stores explicit zero tax', () => {
    const amounts = resolveTaxAmounts({
      amount: '500',
      currency: 'ILS',
      vatMode: 'zero',
    });
    expect(amounts.taxAmount?.amount).toBe('0.000000');
    expect(amounts.subtotalAmount.amount).toBe(amounts.totalAmount.amount);
  });
});
