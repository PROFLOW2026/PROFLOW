import { describe, expect, it } from 'vitest';
import {
  inferExpenseTaxModeFromAmounts,
  resolveTaxAmounts,
} from '@/modules/expenses/domain/tax';

describe('expense tax resolution', () => {
  const rate18 = { method: 'percentage' as const, ratePercent: '18' };

  it('derives net from gross minus tax when only entered and tax are supplied (manual)', () => {
    const amounts = resolveTaxAmounts({
      enteredAmount: '1180',
      taxAmount: '180',
      currency: 'ILS',
    });

    expect(amounts.netAmount.amount).toBe('1000.000000');
    expect(amounts.taxAmount?.amount).toBe('180.000000');
    expect(amounts.grossAmount.amount).toBe('1180.000000');
  });

  it('legacy capture without mode keeps entered as both net and gross (no invented VAT)', () => {
    const amounts = resolveTaxAmounts({
      enteredAmount: '1500',
      currency: 'ILS',
      resolved: rate18,
    });

    expect(amounts.netAmount.amount).toBe('1500.000000');
    expect(amounts.taxAmount).toBeNull();
    expect(amounts.grossAmount.amount).toBe('1500.000000');
    expect(amounts.breakdown).toBeNull();
  });

  it('excluding mode treats entered as net and derives VAT from the org rule rate', () => {
    const amounts = resolveTaxAmounts({
      enteredAmount: '1000',
      currency: 'ILS',
      amountIncludesTax: false,
      resolved: rate18,
    });

    expect(amounts.netAmount.amount).toBe('1000.000000');
    expect(amounts.taxAmount?.amount).toBe('180.000000');
    expect(amounts.grossAmount.amount).toBe('1180.000000');
    expect(amounts.breakdown?.amountIncludesTax).toBe(false);
  });

  it('including mode derives net from gross using the org rule rate (not hardcoded)', () => {
    const amounts = resolveTaxAmounts({
      enteredAmount: '1180',
      currency: 'ILS',
      amountIncludesTax: true,
      resolved: rate18,
    });

    expect(amounts.grossAmount.amount).toBe('1180.000000');
    expect(amounts.netAmount.amount).toBe('1000.000000');
    expect(amounts.taxAmount?.amount).toBe('180.000000');
    expect(amounts.breakdown?.amountIncludesTax).toBe(true);
  });

  it('uses a non-18% configured rate for exclusive amounts', () => {
    const amounts = resolveTaxAmounts({
      enteredAmount: '100',
      currency: 'ILS',
      amountIncludesTax: false,
      resolved: { method: 'percentage', ratePercent: '17' },
    });

    expect(amounts.taxAmount?.amount).toBe('17.000000');
    expect(amounts.grossAmount.amount).toBe('117.000000');
  });

  it('manual net/tax override bypasses the tax engine', () => {
    const amounts = resolveTaxAmounts({
      enteredAmount: '1200',
      currency: 'ILS',
      amountIncludesTax: true,
      netAmount: '1000',
      taxAmount: '200',
      resolved: rate18,
    });

    expect(amounts.netAmount.amount).toBe('1000.000000');
    expect(amounts.taxAmount?.amount).toBe('200.000000');
    expect(amounts.grossAmount.amount).toBe('1200.000000');
    expect(amounts.breakdown).toBeNull();
  });

  it('infers including mode from persisted tax for edit without a mode column', () => {
    expect(
      inferExpenseTaxModeFromAmounts({
        netAmount: '1000.000000',
        taxAmount: '180.000000',
        grossAmount: '1180.000000',
      }),
    ).toEqual({ amount: '1180.000000', amountIncludesTax: true });

    expect(
      inferExpenseTaxModeFromAmounts({
        netAmount: '1500.000000',
        taxAmount: null,
        grossAmount: '1500.000000',
      }),
    ).toEqual({ amount: '1500.000000', amountIncludesTax: false });
  });
});
