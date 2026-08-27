import { describe, expect, it } from 'vitest';
import {
  allocateApLineMonetarySplits,
  assertApLineNetConservesBill,
} from '@/modules/ap/domain/bill-line-monetary';

describe('AP line monetary split', () => {
  it('zero VAT: line NET equals line gross', () => {
    const splits = allocateApLineMonetarySplits({
      currency: 'ILS',
      billNetAmount: '15000',
      billTaxAmount: '0',
      billGrossAmount: '15000',
      lines: [
        { lineTotal: '10000' },
        { lineTotal: '2000' },
        { lineTotal: '3000' },
      ],
    });
    expect(splits.map((s) => s.netAmount)).toEqual(['10000.000000', '2000.000000', '3000.000000']);
    expect(splits.every((s) => s.taxAmount === '0.000000')).toBe(true);
  });

  it('VAT bill: category buckets use NET only', () => {
    const splits = allocateApLineMonetarySplits({
      currency: 'ILS',
      billNetAmount: '100',
      billTaxAmount: '17',
      billGrossAmount: '117',
      lines: [{ lineTotal: '117' }],
    });
    expect(splits[0]!.netAmount).toBe('100.000000');
    expect(splits[0]!.taxAmount).toBe('17.000000');
    expect(splits[0]!.grossAmount).toBe('117.000000');
  });

  it('rejects line gross mismatch', () => {
    expect(() =>
      allocateApLineMonetarySplits({
        currency: 'ILS',
        billNetAmount: '15000',
        billTaxAmount: '0',
        billGrossAmount: '15000',
        lines: [{ lineTotal: '14999' }],
      }),
    ).toThrow(/gross/i);
  });

  it('assertApLineNetConservesBill rejects 1 agora drift', () => {
    expect(() =>
      assertApLineNetConservesBill({
        currency: 'ILS',
        billNetAmount: '15000',
        lineNetAmounts: ['14999'],
      }),
    ).toThrow(/NET/i);
  });
});
