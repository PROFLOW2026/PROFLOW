import { describe, expect, it } from 'vitest';
import { calculateLaborCost, hoursToRateUnits } from '@/modules/workforce/domain/labor-cost';
import { money, moneyEquals } from '@/shared/money';

describe('hoursToRateUnits', () => {
  it('uses hours directly for hourly rates', () => {
    expect(hoursToRateUnits('4', 'hourly')).toBe('4');
  });

  it('converts hours to day fractions for daily rates', () => {
    expect(hoursToRateUnits('8', 'daily', { standardHoursPerDay: '8', standardHoursPerMonth: '160' })).toBe('1');
    expect(hoursToRateUnits('4', 'daily', { standardHoursPerDay: '8', standardHoursPerMonth: '160' })).toBe('0.5');
  });

  it('converts hours to month fractions for monthly rates', () => {
    expect(hoursToRateUnits('182', 'monthly', { standardHoursPerDay: '8', standardHoursPerMonth: '182' })).toBe('1');
  });
});

describe('calculateLaborCost', () => {
  it('applies employer burden on top of base wage', () => {
    const result = calculateLaborCost({
      baseRate: '100',
      currency: 'ILS',
      rateUnit: 'hourly',
      hours: '8',
      burdenPercent: '30',
    });

    expect(moneyEquals(result.basePortion, money('800', 'ILS'))).toBe(true);
    expect(moneyEquals(result.burdenPortion, money('240', 'ILS'))).toBe(true);
    expect(moneyEquals(result.total, money('1040', 'ILS'))).toBe(true);
  });

  it('adds percent and flat amount components', () => {
    const result = calculateLaborCost({
      baseRate: '100',
      currency: 'ILS',
      rateUnit: 'hourly',
      hours: '1',
      burdenPercent: null,
      components: [
        { basis: 'percent', amount: null, percent: '10', currency: null },
        { basis: 'amount', amount: '25', percent: null, currency: 'ILS' },
      ],
    });

    expect(moneyEquals(result.total, money('135', 'ILS'))).toBe(true);
  });
});
