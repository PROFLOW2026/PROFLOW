import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import { formatMoney } from '@/shared/money/format';
import { formatDecimalDisplay, formatPercentDisplay } from '@/shared/number/display';

describe('business decimal display', () => {
  it('shows exactly two fraction digits for quantities', () => {
    expect(formatDecimalDisplay('1.000000', 'he-IL')).toBe('1.00');
    expect(formatDecimalDisplay('125.456789', 'he-IL')).toBe('125.46');
    expect(formatDecimalDisplay('1750000', 'he-IL')).toBe('1,750,000.00');
    expect(formatDecimalDisplay('1750000.000000', 'en')).toBe('1,750,000.00');
  });

  it('rounds half-up at presentation time', () => {
    expect(formatDecimalDisplay('1.225', 'he-IL')).toBe('1.23');
    expect(formatDecimalDisplay('1.224', 'he-IL')).toBe('1.22');
  });

  it('shows stored percent points with two fraction digits', () => {
    expect(formatPercentDisplay('5.000000', 'he-IL')).toBe('5.00%');
    expect(formatPercentDisplay(5, 'en')).toBe('5.00%');
    expect(formatPercentDisplay('125.456789', 'he-IL')).toBe('125.46%');
  });

  it('keeps money display on two fraction digits including whole amounts', () => {
    expect(formatMoney(money('1750000', 'ILS'), 'he-IL')).toBe('1,750,000.00 ₪');
    expect(formatMoney(money('1', 'ILS'), 'he-IL', { decimals: 'auto' })).toBe('1.00 ₪');
    expect(formatMoney(money('1', 'ILS'), 'he-IL', { decimals: 'whole' })).toBe('1 ₪');
  });
});
