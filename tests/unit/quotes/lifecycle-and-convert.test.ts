import { describe, expect, it } from 'vitest';
import {
  assertCanTransitionQuoteStatus,
  assertQuoteEditable,
  assertQuoteIsNotBilling,
  canTransitionQuoteStatus,
  isQuoteConvertible,
  isQuoteEditable,
  isQuoteTerminal,
  quoteCreatesBillingRecord,
  quoteIsNotChangeOrder,
} from '@/modules/quotes/domain/lifecycle';
import {
  assertCanConvertQuote,
  contractEnteredAmountFromQuote,
  isQuoteAlreadyConverted,
  resolveCompletedQuoteConversion,
} from '@/modules/quotes/domain/conversion';
import {
  computeEstimatedMarginPercent,
  computeLineMarginPercent,
  computeLineMarkupPercent,
  computeQuoteTotals,
  contractNetFromQuote,
} from '@/modules/quotes/domain/totals';
import { money } from '@/shared/money';
import { DomainRuleError } from '@/shared/errors';

describe('quote lifecycle', () => {
  it('allows draft → ready/sent/cancelled and ready → sent', () => {
    expect(canTransitionQuoteStatus('draft', 'ready')).toBe(true);
    expect(canTransitionQuoteStatus('draft', 'sent')).toBe(true);
    expect(canTransitionQuoteStatus('ready', 'sent')).toBe(true);
    expect(canTransitionQuoteStatus('ready', 'draft')).toBe(true);
    expect(canTransitionQuoteStatus('sent', 'accepted')).toBe(true);
    expect(canTransitionQuoteStatus('sent', 'rejected')).toBe(true);
    expect(canTransitionQuoteStatus('accepted', 'converted')).toBe(true);
  });

  it('blocks illegal transitions and terminal edits', () => {
    expect(canTransitionQuoteStatus('draft', 'accepted')).toBe(false);
    expect(canTransitionQuoteStatus('converted', 'accepted')).toBe(false);
    expect(canTransitionQuoteStatus('rejected', 'sent')).toBe(false);
    expect(() => assertCanTransitionQuoteStatus('sent', 'draft')).toThrow(DomainRuleError);
    expect(isQuoteEditable('draft')).toBe(true);
    expect(isQuoteEditable('sent')).toBe(false);
    expect(() => assertQuoteEditable('accepted')).toThrow(DomainRuleError);
    expect(isQuoteTerminal('converted')).toBe(true);
    expect(isQuoteConvertible('accepted')).toBe(true);
    expect(isQuoteConvertible('sent')).toBe(false);
  });

  it('never treats quote as billing or change order', () => {
    expect(quoteCreatesBillingRecord()).toBe(false);
    expect(quoteIsNotChangeOrder()).toBe(true);
    expect(() => assertQuoteIsNotBilling()).not.toThrow();
  });
});

describe('quote totals and pre-win profitability', () => {
  it('rolls up exclusive tax via tax authority breakdown', () => {
    const totals = computeQuoteTotals({
      currency: 'ILS',
      taxMode: 'exclusive',
      resolved: { method: 'percentage', ratePercent: '17' },
      lines: [
        {
          description: 'Install',
          quantity: '2',
          unitPriceAmount: '100',
          estimatedUnitCostAmount: '60',
        },
      ],
    });
    expect(totals.subtotalAmount).toBe('200.000000');
    expect(totals.taxAmount).toBe('34.000000');
    expect(totals.totalAmount).toBe('234.000000');
    expect(totals.estimatedCostAmount).toBe('120.000000');
    expect(totals.estimatedMarginPercent).toBe('40.000000');
    expect(totals.lines[0]?.lineTotalAmount).toBe('200.000000');
  });

  it('supports tax mode none and markup/margin helpers', () => {
    const totals = computeQuoteTotals({
      currency: 'ILS',
      taxMode: 'none',
      resolved: null,
      lines: [{ description: 'A', quantity: '1', unitPriceAmount: '50' }],
    });
    expect(totals.taxAmount).toBeNull();
    expect(totals.totalAmount).toBe('50.000000');
    expect(totals.estimatedCostAmount).toBeNull();
    expect(computeLineMarkupPercent('120', '100')).toBe('20.000000');
    expect(computeLineMarginPercent('100', '60')).toBe('40.000000');
    expect(
      computeEstimatedMarginPercent(money('100', 'ILS'), money('70', 'ILS')),
    ).toBe('30.000000');
  });

  it('contract net uses subtotal not tax total', () => {
    expect(contractNetFromQuote('100.000000')).toBe('100.000000');
    expect(contractNetFromQuote(null)).toBeNull();
  });
});

describe('quote convert invariants', () => {
  const base = {
    status: 'accepted' as const,
    convertedAt: null,
    convertedProjectId: null,
    subtotalAmount: '1000.000000',
    taxAmount: '170.000000',
    totalAmount: '1170.000000',
    currency: 'ILS',
    clientId: '11111111-1111-1111-1111-111111111111',
    contactId: null,
    title: 'Kitchen remodel',
    description: 'Scope',
    notes: null,
  };

  it('requires accepted + subtotal and prefers net for contract seed', () => {
    expect(() => assertCanConvertQuote(base)).not.toThrow();
    expect(contractEnteredAmountFromQuote(base, false)).toEqual({
      enteredAmount: '1000.000000',
      amountIncludesTax: false,
    });
    expect(contractEnteredAmountFromQuote(base, true)).toEqual({
      enteredAmount: '1170.000000',
      amountIncludesTax: true,
    });
  });

  it('blocks convert from non-accepted and detects prior conversion', () => {
    expect(() => assertCanConvertQuote({ ...base, status: 'sent' })).toThrow(DomainRuleError);
    expect(() => assertCanConvertQuote({ ...base, subtotalAmount: null })).toThrow(DomainRuleError);
    const converted = {
      ...base,
      status: 'converted' as const,
      convertedProjectId: '22222222-2222-2222-2222-222222222222',
      convertedAt: new Date(),
    };
    expect(isQuoteAlreadyConverted(converted)).toBe(true);
    expect(resolveCompletedQuoteConversion(converted)?.projectId).toBe(
      '22222222-2222-2222-2222-222222222222',
    );
    expect(() => assertCanConvertQuote(converted)).toThrow(DomainRuleError);
  });
});
