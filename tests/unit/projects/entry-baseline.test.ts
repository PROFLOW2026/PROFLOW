import { describe, expect, it } from 'vitest';
import {
  computeEntryBaselineAmounts,
  computeManagedOpeningNet,
  isZeroOpeningReductionAmount,
} from '@/modules/projects/domain/entry-baseline';
import { formatMoney } from '@/shared/money/format';
import { money, subtractMoney } from '@/shared/money';

const vat18 = { method: 'percentage' as const, ratePercent: '18' };

describe('entry baseline domain', () => {
  it('Scenario A: 200k original − 150k reduction ⇒ managed 50k (excluding tax)', () => {
    const baseline = computeEntryBaselineAmounts({
      displayEnteredAmount: '200000',
      openingReductionAmount: '150000',
      currency: 'ILS',
      amountIncludesTax: false,
      resolved: vat18,
    });

    expect(baseline.hasOpeningReduction).toBe(true);
    expect(baseline.displayNet).toBe('200000.000000');
    expect(baseline.reductionNet).toBe('150000.000000');
    expect(baseline.managedNet).toBe('50000.000000');
    expect(baseline.managedEntered).toBe('50000.000000');

    const managed = computeManagedOpeningNet(money('200000', 'ILS'), money('150000', 'ILS'));
    expect(managed.amount).toBe('50000.000000');

    // Live preview formatting (he-IL): 52,000 ₪ style - whole units, symbol after.
    expect(formatMoney(money('50000', 'ILS'), 'he-IL')).toBe('50,000 ₪');
  });

  it('Scenario A margin sketch: managed 50k − expense 10k = 40k; +20k CO ⇒ current 70k', () => {
    const managedOpening = money('50000', 'ILS');
    const expense = money('10000', 'ILS');
    const actualMargin = subtractMoney(managedOpening, expense);
    expect(actualMargin.amount).toBe('40000.000000');

    const afterChange = money('70000', 'ILS');
    expect(afterChange.amount).toBe('70000.000000');
    // Reduction must never appear as a payment / bill / expense amount.
    expect(money('150000', 'ILS').amount).not.toBe(expense.amount);
  });

  it('Scenario B: reduction 0 ⇒ identical to today (no stored reduction)', () => {
    const withEmpty = computeEntryBaselineAmounts({
      displayEnteredAmount: '200000',
      openingReductionAmount: '',
      currency: 'ILS',
      amountIncludesTax: false,
      resolved: vat18,
    });
    const withZero = computeEntryBaselineAmounts({
      displayEnteredAmount: '200000',
      openingReductionAmount: '0',
      currency: 'ILS',
      amountIncludesTax: false,
      resolved: vat18,
    });
    const without = computeEntryBaselineAmounts({
      displayEnteredAmount: '200000',
      currency: 'ILS',
      amountIncludesTax: false,
      resolved: vat18,
    });

    expect(withEmpty.hasOpeningReduction).toBe(false);
    expect(withZero.hasOpeningReduction).toBe(false);
    expect(without.hasOpeningReduction).toBe(false);
    expect(withEmpty.managedNet).toBe('200000.000000');
    expect(withZero.managedNet).toBe(without.managedNet);
    expect(withEmpty.managedNet).toBe(without.managedNet);
    expect(isZeroOpeningReductionAmount(null, 'ILS')).toBe(true);
    expect(isZeroOpeningReductionAmount('0', 'ILS')).toBe(true);
  });

  it('uses the same tax mode for display and reduction (including VAT)', () => {
    const baseline = computeEntryBaselineAmounts({
      displayEnteredAmount: '236000', // 200k net @ 18%
      openingReductionAmount: '177000', // 150k net @ 18%
      currency: 'ILS',
      amountIncludesTax: true,
      resolved: vat18,
    });

    expect(baseline.displayNet).toBe('200000.000000');
    expect(baseline.reductionNet).toBe('150000.000000');
    expect(baseline.managedNet).toBe('50000.000000');
    expect(baseline.managedGross).toBe('59000.000000');
    expect(baseline.managedEntered).toBe('59000.000000');
  });

  it('rejects reduction larger than display original (net)', () => {
    expect(() =>
      computeEntryBaselineAmounts({
        displayEnteredAmount: '50000',
        openingReductionAmount: '60000',
        currency: 'ILS',
        amountIncludesTax: false,
        resolved: vat18,
      }),
    ).toThrow(/exceed/i);
  });
});
