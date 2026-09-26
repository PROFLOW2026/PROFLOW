import { describe, expect, it } from 'vitest';
import {
  OPENING_CASH_BALANCE_SETTING_KEY,
  parseOpeningCashBalance,
} from '@/modules/tenancy/domain/opening-cash-balance';

describe('opening_cash_balance organization setting', () => {
  it('uses the stable setting key', () => {
    expect(OPENING_CASH_BALANCE_SETTING_KEY).toBe('opening_cash_balance');
  });

  it('parses amount, currency, and as-of date', () => {
    expect(
      parseOpeningCashBalance({
        amount: '1500.50',
        currency: 'ils',
        asOf: '2026-09-01',
      }),
    ).toEqual({
      amount: '1500.50',
      currency: 'ILS',
      asOf: '2026-09-01',
    });
  });

  it('returns null when the setting is missing or invalid', () => {
    expect(parseOpeningCashBalance(null)).toBeNull();
    expect(parseOpeningCashBalance({ amount: '10', currency: 'ILS' })).toBeNull();
    expect(
      parseOpeningCashBalance({ amount: '10', currency: 'ILS', asOf: '01-09-2026' }),
    ).toBeNull();
    expect(
      parseOpeningCashBalance({ amount: 'nope', currency: 'ILS', asOf: '2026-09-01' }),
    ).toBeNull();
  });
});
