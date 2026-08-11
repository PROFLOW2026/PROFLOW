import { describe, expect, it } from 'vitest';
import {
  assertCanConvertQuote,
  contractEnteredAmountFromQuote,
  isQuoteAlreadyConverted,
} from '@/modules/quotes/domain/conversion';
import { assertQuoteIsNotBilling } from '@/modules/quotes/domain/lifecycle';

const base = {
  status: 'accepted' as const,
  convertedAt: null,
  convertedProjectId: null,
  subtotalAmount: '1000.00',
  taxAmount: '170.00',
  totalAmount: '1170.00',
  currency: 'ILS',
  clientId: 'c1',
  contactId: null,
  title: 'Install',
  description: null,
  notes: null,
};

describe('quote conversion integrity', () => {
  it('never treats quote as billing', () => {
    expect(() => assertQuoteIsNotBilling()).not.toThrow();
  });

  it('seeds contract from net subtotal by default (VAT is not revenue)', () => {
    const entered = contractEnteredAmountFromQuote(base, false);
    expect(entered).toEqual({ enteredAmount: '1000.00', amountIncludesTax: false });
  });

  it('requires total when caller opts into tax-inclusive seed', () => {
    const entered = contractEnteredAmountFromQuote(base, true);
    expect(entered.enteredAmount).toBe('1170.00');
    expect(entered.amountIncludesTax).toBe(true);
  });

  it('blocks convert when already converted', () => {
    expect(
      isQuoteAlreadyConverted({
        ...base,
        status: 'converted',
        convertedProjectId: 'p1',
        convertedAt: new Date(),
      }),
    ).toBe(true);
    expect(() =>
      assertCanConvertQuote({
        ...base,
        status: 'converted',
        convertedProjectId: 'p1',
        convertedAt: new Date(),
      }),
    ).toThrow();
  });

  it('requires accepted status and commercial subtotal', () => {
    expect(() => assertCanConvertQuote({ ...base, status: 'sent' })).toThrow();
    expect(() => assertCanConvertQuote({ ...base, subtotalAmount: null })).toThrow();
  });
});
