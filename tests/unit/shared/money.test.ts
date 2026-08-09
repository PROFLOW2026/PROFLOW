import { describe, expect, it } from 'vitest';
import {
  CurrencyMismatchError,
  MoneyError,
  addMoney,
  compareMoney,
  isNegativeMoney,
  money,
  multiplyMoney,
  percentOfMoney,
  roundMoney,
  splitMoneyEvenly,
  subtractMoney,
  sumMoney,
  zeroMoney,
} from '@/shared/money/money';
import { formatMoney, formatMoneyDelta } from '@/shared/money/format';

describe('money construction', () => {
  it('normalises every amount to the storage scale', () => {
    expect(money('12.5', 'ILS')).toEqual({ amount: '12.500000', currency: 'ILS' });
    expect(money('0', 'USD').amount).toBe('0.000000');
  });

  it('uppercases and validates the currency code', () => {
    expect(money('1', 'ils').currency).toBe('ILS');
    expect(() => money('1', 'shekel')).toThrow(MoneyError);
  });

  it('refuses a non-integer JS number, the usual source of float drift', () => {
    expect(() => money(0.1 + 0.2, 'ILS')).toThrow(MoneyError);
    expect(money(1200, 'ILS').amount).toBe('1200.000000');
  });

  it('refuses text that is not a plain decimal string', () => {
    expect(() => money('1,200.00', 'ILS')).toThrow(MoneyError);
    expect(() => money('', 'ILS')).toThrow(MoneyError);
    expect(() => money('12.5e3', 'ILS')).toThrow(MoneyError);
  });
});

describe('money arithmetic', () => {
  it('adds the classic float-drift case exactly', () => {
    expect(addMoney(money('0.1', 'ILS'), money('0.2', 'ILS')).amount).toBe('0.300000');
  });

  it('refuses to combine different currencies rather than guessing a rate', () => {
    expect(() => addMoney(money('1', 'ILS'), money('1', 'USD'))).toThrow(CurrencyMismatchError);
    expect(() => compareMoney(money('1', 'ILS'), money('1', 'USD'))).toThrow(CurrencyMismatchError);
  });

  it('subtracts into a negative, which is how a reduction is represented', () => {
    const result = subtractMoney(money('100', 'ILS'), money('150', 'ILS'));
    expect(result.amount).toBe('-50.000000');
    expect(isNegativeMoney(result)).toBe(true);
  });

  it('sums an empty list to zero in the requested currency', () => {
    expect(sumMoney([], 'EUR')).toEqual(zeroMoney('EUR'));
  });

  it('multiplies and takes a percentage without binary rounding', () => {
    expect(multiplyMoney(money('19.99', 'ILS'), '3').amount).toBe('59.970000');
    expect(percentOfMoney(money('1000', 'ILS'), 17).amount).toBe('170.000000');
  });
});

describe('rounding and splitting', () => {
  it('rounds half up at the currency minor unit', () => {
    expect(roundMoney(money('10.005', 'ILS')).amount).toBe('10.010000');
    // JPY has no minor unit.
    expect(roundMoney(money('10.5', 'JPY')).amount).toBe('11.000000');
  });

  it('splits without losing or inventing a minor unit', () => {
    const shares = splitMoneyEvenly(money('100', 'ILS'), 3);
    expect(shares.map((share) => share.amount)).toEqual(['33.340000', '33.330000', '33.330000']);
    expect(sumMoney(shares, 'ILS').amount).toBe('100.000000');
  });

  it('rejects a nonsensical split count', () => {
    expect(() => splitMoneyEvenly(money('10', 'ILS'), 0)).toThrow(MoneyError);
    expect(() => splitMoneyEvenly(money('10', 'ILS'), 2.5)).toThrow(MoneyError);
  });
});

describe('formatting', () => {
  it('uses a true minus sign so a loss never depends on colour', () => {
    const formatted = formatMoney(money('-1500', 'ILS'), 'he-IL');
    expect(formatted.startsWith('\u2212')).toBe(true);
    expect(formatted).not.toContain('-');
  });

  it('shows an explicit plus for deltas such as approved additions', () => {
    expect(formatMoneyDelta(money('2500', 'ILS'), 'he-IL').startsWith('+')).toBe(true);
    expect(formatMoneyDelta(money('0', 'ILS'), 'he-IL').startsWith('+')).toBe(false);
  });

  it('keeps the currency visible in both locales', () => {
    expect(formatMoney(money('1000', 'ILS'), 'he-IL')).toContain('₪');
    expect(formatMoney(money('1000', 'USD'), 'en')).toContain('$');
  });
});
