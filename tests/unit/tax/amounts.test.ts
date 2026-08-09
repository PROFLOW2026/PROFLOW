import { describe, expect, it } from 'vitest';
import {
  computeTaxAmountBreakdown,
  netFromInclusiveGross,
} from '@/modules/tax/domain/amounts';
import { money } from '@/shared/money';

describe('computeTaxAmountBreakdown', () => {
  const rate18 = { method: 'percentage' as const, ratePercent: '18' };

  it('treats excluding mode as net and derives VAT from the tax rule rate', () => {
    const result = computeTaxAmountBreakdown({
      enteredAmount: '100000',
      currency: 'ILS',
      amountIncludesTax: false,
      resolved: rate18,
    });

    expect(result.net.amount).toBe('100000.000000');
    expect(result.tax.amount).toBe('18000.000000');
    expect(result.gross.amount).toBe('118000.000000');
    expect(result.ratePercent).toBe('18');
  });

  it('derives net and VAT from an including-VAT amount without hardcoding the rate', () => {
    const result = computeTaxAmountBreakdown({
      enteredAmount: '118000',
      currency: 'ILS',
      amountIncludesTax: true,
      resolved: rate18,
    });

    expect(result.gross.amount).toBe('118000.000000');
    expect(result.net.amount).toBe('100000.000000');
    expect(result.tax.amount).toBe('18000.000000');
  });

  it('uses a non-18% configured rate', () => {
    const result = computeTaxAmountBreakdown({
      enteredAmount: '100',
      currency: 'ILS',
      amountIncludesTax: false,
      resolved: { method: 'percentage', ratePercent: '17' },
    });

    expect(result.tax.amount).toBe('17.000000');
    expect(result.gross.amount).toBe('117.000000');
  });

  it('handles zero amount', () => {
    const result = computeTaxAmountBreakdown({
      enteredAmount: '0',
      currency: 'ILS',
      amountIncludesTax: true,
      resolved: rate18,
    });

    expect(result.net.amount).toBe('0.000000');
    expect(result.tax.amount).toBe('0.000000');
    expect(result.gross.amount).toBe('0.000000');
  });

  it('treats exempt / missing percentage as zero tax without inventing a rate', () => {
    const exempt = computeTaxAmountBreakdown({
      enteredAmount: '50000',
      currency: 'ILS',
      amountIncludesTax: false,
      resolved: { method: 'exempt', ratePercent: null },
    });
    expect(exempt.tax.amount).toBe('0.000000');
    expect(exempt.net.amount).toBe('50000.000000');
    expect(exempt.gross.amount).toBe('50000.000000');

    const missing = computeTaxAmountBreakdown({
      enteredAmount: '50000',
      currency: 'ILS',
      amountIncludesTax: false,
      resolved: null,
    });
    expect(missing.tax.amount).toBe('0.000000');
    expect(missing.net.amount).toBe('50000.000000');
  });

  it('keeps money precision on inclusive reverse calculation', () => {
    const gross = money('118000.00', 'ILS');
    const net = netFromInclusiveGross(gross, '18');
    expect(net.amount).toBe('100000.000000');
  });
});
