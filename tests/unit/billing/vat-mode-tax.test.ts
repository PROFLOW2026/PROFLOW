import { describe, expect, it } from 'vitest';
import { resolveTaxAmounts } from '@/modules/billing/domain/tax';

describe('billing tax resolution (VAT entry modes)', () => {
  const rate18 = { method: 'percentage' as const, ratePercent: '18' };

  it('exclusive (before VAT): entered is NET; derives VAT and GROSS from org rate', () => {
    const amounts = resolveTaxAmounts({
      amount: '73500',
      currency: 'ILS',
      vatMode: 'exclusive',
      resolved: rate18,
    });

    expect(amounts.subtotalAmount.amount).toBe('73500.000000');
    expect(amounts.taxAmount?.amount).toBe('13230.000000');
    expect(amounts.totalAmount.amount).toBe('86730.000000');
  });

  it('inclusive (including VAT): entered is GROSS; derives NET and VAT from org rate', () => {
    const amounts = resolveTaxAmounts({
      amount: '73500',
      currency: 'ILS',
      vatMode: 'inclusive',
      resolved: rate18,
    });

    expect(amounts.totalAmount.amount).toBe('73500.000000');
    expect(amounts.subtotalAmount.amount).toBe('62288.135593');
    expect(amounts.taxAmount?.amount).toBe('11211.864407');
  });

  it('zero (no VAT): entered is NET = GROSS; tax is explicit zero', () => {
    const amounts = resolveTaxAmounts({
      amount: '73500',
      currency: 'ILS',
      vatMode: 'zero',
      resolved: rate18,
    });

    expect(amounts.subtotalAmount.amount).toBe('73500.000000');
    expect(amounts.taxAmount?.amount).toBe('0.000000');
    expect(amounts.totalAmount.amount).toBe('73500.000000');
  });

  it('legacy without vatMode keeps entered as both subtotal and total (no invented VAT)', () => {
    const amounts = resolveTaxAmounts({
      amount: '1500',
      currency: 'ILS',
      resolved: rate18,
    });

    expect(amounts.subtotalAmount.amount).toBe('1500.000000');
    expect(amounts.taxAmount).toBeNull();
    expect(amounts.totalAmount.amount).toBe('1500.000000');
  });

  it('uses a non-18% configured rate for exclusive amounts', () => {
    const amounts = resolveTaxAmounts({
      amount: '100',
      currency: 'ILS',
      vatMode: 'exclusive',
      resolved: { method: 'percentage', ratePercent: '17' },
    });

    expect(amounts.taxAmount?.amount).toBe('17.000000');
    expect(amounts.totalAmount.amount).toBe('117.000000');
  });
});
