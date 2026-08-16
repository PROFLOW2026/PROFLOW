import { describe, expect, it } from 'vitest';
import {
  resolveApBillTaxSplit,
  vendorBillActualAmount,
  vendorBillPayableAmount,
} from '@/modules/ap/domain/bill-tax';

const ILS = 'ILS';

describe('AP bill tax split', () => {
  it('tax-exclusive: entered is NET, VAT added to GROSS payable', () => {
    const split = resolveApBillTaxSplit({
      enteredAmount: '100.00',
      currency: ILS,
      amountIncludesTax: false,
      resolved: { method: 'percentage', ratePercent: '17' },
    });
    expect(split.netAmount).toBe('100.000000');
    expect(split.taxAmount).toBe('17.000000');
    expect(split.grossAmount).toBe('117.000000');
    expect(split.totalAmount).toBe(split.grossAmount);
    expect(split.taxBasis).toBe('canonical');
    expect(vendorBillActualAmount(split)).toBe(split.netAmount);
    expect(vendorBillPayableAmount(split)).toBe(split.grossAmount);
  });

  it('VAT-inclusive: entered is GROSS, Actual uses NET', () => {
    const split = resolveApBillTaxSplit({
      enteredAmount: '117.00',
      currency: ILS,
      amountIncludesTax: true,
      resolved: { method: 'percentage', ratePercent: '17' },
    });
    expect(split.grossAmount).toBe('117.000000');
    expect(split.taxAmount).toBe('17.000000');
    expect(split.netAmount).toBe('100.000000');
    expect(split.taxBasis).toBe('canonical');
    expect(vendorBillActualAmount({ netAmount: split.netAmount, totalAmount: split.totalAmount })).toBe(
      '100.000000',
    );
  });

  it('zero/exempt: explicit zero tax is zero_exempt, Actual = entered', () => {
    const split = resolveApBillTaxSplit({
      enteredAmount: '80.00',
      currency: ILS,
      amountIncludesTax: false,
      taxAmount: '0',
      netAmount: '80.00',
    });
    expect(split.netAmount).toBe('80.000000');
    expect(split.taxAmount).toBe('0.000000');
    expect(split.grossAmount).toBe('80.000000');
    expect(split.taxBasis).toBe('zero_exempt');
  });

  it('legacy undivided: no mode and no split - do not invent VAT', () => {
    const split = resolveApBillTaxSplit({
      enteredAmount: '500.00',
      currency: ILS,
    });
    expect(split.netAmount).toBe('500.000000');
    expect(split.taxAmount).toBe('0');
    expect(split.grossAmount).toBe('500.000000');
    expect(split.taxBasis).toBe('legacy_undivided');
    expect(vendorBillActualAmount({ totalAmount: '500.00' })).toBe('500.00');
  });

  it('credits: payable GROSS falls back to total when gross omitted', () => {
    expect(vendorBillPayableAmount({ totalAmount: '117.00' })).toBe('117.00');
    expect(vendorBillPayableAmount({ grossAmount: '117.00', totalAmount: '117.00' })).toBe('117.00');
  });
});
