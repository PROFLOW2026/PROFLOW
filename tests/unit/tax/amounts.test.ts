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

  it('keeps exact agorot on clean inclusive reverse calculation', () => {
    const gross = money('118000.00', 'ILS');
    const net = netFromInclusiveGross(gross, '18');
    expect(net.amount).toBe('100000.000000');
  });

  it('rounds inclusive NET to agorot and keeps tax as gross remainder (101675 @ 18%)', () => {
    const result = computeTaxAmountBreakdown({
      enteredAmount: '101675',
      currency: 'ILS',
      amountIncludesTax: true,
      resolved: rate18,
    });

    expect(result.gross.amount).toBe('101675.000000');
    expect(result.net.amount).toBe('86165.250000');
    expect(result.tax.amount).toBe('15509.750000');
    expect(result.net.amount).not.toBe('86165.254237');
  });

  it('rounds inclusive NET for other non-divisible gross totals', () => {
    const a = computeTaxAmountBreakdown({
      enteredAmount: '42298',
      currency: 'ILS',
      amountIncludesTax: true,
      resolved: rate18,
    });
    expect(a.net.amount).toBe('35845.760000');
    expect(a.tax.amount).toBe('6452.240000');

    const b = computeTaxAmountBreakdown({
      enteredAmount: '108064',
      currency: 'ILS',
      amountIncludesTax: true,
      resolved: rate18,
    });
    expect(b.net.amount).toBe('91579.660000');
    expect(b.tax.amount).toBe('16484.340000');
  });

  it('full NET payment after inclusive rounding clears open balance', async () => {
    const { computeRecordRevenuePosition } = await import(
      '@/modules/billing/domain/revenue-position'
    );
    const breakdown = computeTaxAmountBreakdown({
      enteredAmount: '101675',
      currency: 'ILS',
      amountIncludesTax: true,
      resolved: rate18,
    });
    const position = computeRecordRevenuePosition(
      {
        kind: 'invoice',
        status: 'finalized',
        subtotalAmount: breakdown.net,
        taxAmount: breakdown.tax,
        totalAmount: breakdown.gross,
        payments: [
          { amount: breakdown.net, amountBasis: 'net', status: 'recorded' },
        ],
      },
      'ILS',
    );
    expect(Number(position!.open.net.amount)).toBe(0);
    expect(Number(position!.open.gross.amount)).toBe(0);
  });
});
