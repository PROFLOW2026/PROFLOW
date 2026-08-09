import Decimal from 'decimal.js';

/**
 * Money primitives (docs 04, 71 §8).
 *
 * Rules enforced here:
 *  - every amount carries an ISO-4217 currency; there is no bare "number" money
 *  - arithmetic runs on decimal.js, never IEEE-754 floats
 *  - persistence always goes through `toNumericString` (DB column is numeric(18,6))
 */

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -9e15, toExpPos: 9e15 });

/** Scale used by the `numeric(18,6)` money columns. */
export const MONEY_STORAGE_SCALE = 6;

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** Minor-unit count per currency for display and rounding boundaries. */
const CURRENCY_DISPLAY_SCALE: Readonly<Record<string, number>> = {
  ILS: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
};

const DEFAULT_DISPLAY_SCALE = 2;

export type CurrencyCode = string;

export interface MoneyValue {
  /** Decimal string, never a float. Always normalised to `MONEY_STORAGE_SCALE`. */
  readonly amount: string;
  readonly currency: CurrencyCode;
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export class CurrencyMismatchError extends MoneyError {
  constructor(left: CurrencyCode, right: CurrencyCode) {
    super(`Cannot combine money in ${left} with money in ${right}. Conversion is out of V1 scope.`);
    this.name = 'CurrencyMismatchError';
  }
}

export function displayScaleFor(currency: CurrencyCode): number {
  return CURRENCY_DISPLAY_SCALE[normaliseCurrency(currency)] ?? DEFAULT_DISPLAY_SCALE;
}

function normaliseCurrency(currency: CurrencyCode): CurrencyCode {
  const upper = String(currency ?? '').trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(upper)) {
    throw new MoneyError(`Invalid ISO-4217 currency code: "${currency}"`);
  }
  return upper;
}

/**
 * Accepts decimal strings, integers, and `Decimal` instances.
 *
 * Non-integer JS numbers are rejected: they are the usual entry point for
 * float drift into persisted money. Callers holding user input should pass the
 * raw string from the form field instead of parsing it first.
 */
function toDecimal(input: string | number | bigint | Decimal): Decimal {
  if (input instanceof Decimal) return input;
  if (typeof input === 'bigint') return new Decimal(input.toString());
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new MoneyError(`Money amount must be finite, received ${String(input)}`);
    }
    if (!Number.isInteger(input)) {
      throw new MoneyError(
        `Refusing to build money from the non-integer JS number ${input}. ` +
          'Pass the decimal string (e.g. "12.50") so no binary float rounding is inherited.',
      );
    }
    return new Decimal(input);
  }

  const trimmed = input.trim();
  if (trimmed === '') throw new MoneyError('Money amount cannot be empty');
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(trimmed)) {
    throw new MoneyError(`Money amount is not a plain decimal string: "${input}"`);
  }
  return new Decimal(trimmed);
}

function normaliseAmount(value: Decimal): string {
  if (!value.isFinite()) throw new MoneyError('Money amount must be finite');
  return value.toFixed(MONEY_STORAGE_SCALE);
}

export function money(amount: string | number | bigint | Decimal, currency: CurrencyCode): MoneyValue {
  return { amount: normaliseAmount(toDecimal(amount)), currency: normaliseCurrency(currency) };
}

export function zeroMoney(currency: CurrencyCode): MoneyValue {
  return money('0', currency);
}

export function isMoneyValue(value: unknown): value is MoneyValue {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<MoneyValue>;
  return typeof candidate.amount === 'string' && typeof candidate.currency === 'string';
}

export function toDecimalValue(value: MoneyValue): Decimal {
  return new Decimal(value.amount);
}

function assertSameCurrency(left: MoneyValue, right: MoneyValue): CurrencyCode {
  if (left.currency !== right.currency) throw new CurrencyMismatchError(left.currency, right.currency);
  return left.currency;
}

export function addMoney(left: MoneyValue, right: MoneyValue): MoneyValue {
  const currency = assertSameCurrency(left, right);
  return money(toDecimalValue(left).plus(toDecimalValue(right)), currency);
}

export function subtractMoney(left: MoneyValue, right: MoneyValue): MoneyValue {
  const currency = assertSameCurrency(left, right);
  return money(toDecimalValue(left).minus(toDecimalValue(right)), currency);
}

export function sumMoney(values: readonly MoneyValue[], currency: CurrencyCode): MoneyValue {
  const target = normaliseCurrency(currency);
  return values.reduce<MoneyValue>((acc, value) => addMoney(acc, value), zeroMoney(target));
}

export function multiplyMoney(value: MoneyValue, factor: string | number | Decimal): MoneyValue {
  const multiplier = factor instanceof Decimal ? factor : new Decimal(String(factor));
  if (!multiplier.isFinite()) throw new MoneyError('Multiplication factor must be finite');
  return money(toDecimalValue(value).times(multiplier), value.currency);
}

export function divideMoney(value: MoneyValue, divisor: string | number | Decimal): MoneyValue {
  const d = divisor instanceof Decimal ? divisor : new Decimal(String(divisor));
  if (d.isZero()) throw new MoneyError('Division by zero');
  return money(toDecimalValue(value).dividedBy(d), value.currency);
}

export function negateMoney(value: MoneyValue): MoneyValue {
  return money(toDecimalValue(value).negated(), value.currency);
}

export function absMoney(value: MoneyValue): MoneyValue {
  return money(toDecimalValue(value).abs(), value.currency);
}

/** Percentage helper: 17.5 means 17.5%. */
export function percentOfMoney(value: MoneyValue, percent: string | number | Decimal): MoneyValue {
  const p = percent instanceof Decimal ? percent : new Decimal(String(percent));
  return money(toDecimalValue(value).times(p).dividedBy(100), value.currency);
}

export function compareMoney(left: MoneyValue, right: MoneyValue): -1 | 0 | 1 {
  assertSameCurrency(left, right);
  return toDecimalValue(left).comparedTo(toDecimalValue(right)) as -1 | 0 | 1;
}

export function moneyEquals(left: MoneyValue, right: MoneyValue): boolean {
  return left.currency === right.currency && toDecimalValue(left).equals(toDecimalValue(right));
}

export function isZeroMoney(value: MoneyValue): boolean {
  return toDecimalValue(value).isZero();
}

export function isNegativeMoney(value: MoneyValue): boolean {
  return toDecimalValue(value).isNegative() && !toDecimalValue(value).isZero();
}

export function isPositiveMoney(value: MoneyValue): boolean {
  return toDecimalValue(value).greaterThan(0);
}

export function maxMoney(left: MoneyValue, right: MoneyValue): MoneyValue {
  return compareMoney(left, right) >= 0 ? left : right;
}

export function minMoney(left: MoneyValue, right: MoneyValue): MoneyValue {
  return compareMoney(left, right) <= 0 ? left : right;
}

/** Rounds to the currency's minor unit (or an explicit scale). */
export function roundMoney(value: MoneyValue, scale?: number): MoneyValue {
  const target = scale ?? displayScaleFor(value.currency);
  return money(toDecimalValue(value).toDecimalPlaces(target, Decimal.ROUND_HALF_UP), value.currency);
}

/**
 * Splits an amount into `parts` shares without losing or inventing minor units;
 * the remainder is distributed one minor unit at a time from the first share.
 */
export function splitMoneyEvenly(value: MoneyValue, parts: number): MoneyValue[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new MoneyError(`Split count must be a positive integer, received ${parts}`);
  }
  const scale = displayScaleFor(value.currency);
  const unit = new Decimal(10).pow(-scale);
  const total = toDecimalValue(value).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
  const totalUnits = total.dividedBy(unit).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const base = totalUnits.dividedBy(parts).toDecimalPlaces(0, Decimal.ROUND_DOWN);
  let remainder = totalUnits.minus(base.times(parts));

  const shares: MoneyValue[] = [];
  for (let index = 0; index < parts; index += 1) {
    let units = base;
    if (remainder.greaterThan(0)) {
      units = units.plus(1);
      remainder = remainder.minus(1);
    } else if (remainder.lessThan(0)) {
      units = units.minus(1);
      remainder = remainder.plus(1);
    }
    shares.push(money(units.times(unit), value.currency));
  }
  return shares;
}

/**
 * Allocates by percentage weights. Weights are expressed in percent and must
 * total 100 unless `allowPartial` is set (used by partial overhead allocation).
 * Rounding residue lands on the largest share so the parts always re-sum.
 */
export function allocateMoneyByPercent(
  value: MoneyValue,
  percents: readonly (string | number | Decimal)[],
  options: { allowPartial?: boolean } = {},
): MoneyValue[] {
  if (percents.length === 0) return [];
  const decimals = percents.map((p) => (p instanceof Decimal ? p : new Decimal(String(p))));
  if (decimals.some((p) => p.isNegative())) throw new MoneyError('Allocation percentages cannot be negative');

  const totalPercent = decimals.reduce((acc, p) => acc.plus(p), new Decimal(0));
  if (!options.allowPartial && !totalPercent.equals(100)) {
    throw new MoneyError(`Allocation percentages must total 100, received ${totalPercent.toString()}`);
  }
  if (totalPercent.greaterThan(100)) {
    throw new MoneyError(`Allocation percentages cannot exceed 100, received ${totalPercent.toString()}`);
  }

  const scale = displayScaleFor(value.currency);
  const shares = decimals.map((p) =>
    money(toDecimalValue(value).times(p).dividedBy(100).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP), value.currency),
  );

  const expected = money(
    toDecimalValue(value).times(totalPercent).dividedBy(100).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP),
    value.currency,
  );
  const allocated = sumMoney(shares, value.currency);
  const residue = subtractMoney(expected, allocated);

  if (!isZeroMoney(residue) && shares.length > 0) {
    let largestIndex = 0;
    for (let index = 1; index < shares.length; index += 1) {
      if (compareMoney(shares[index]!, shares[largestIndex]!) > 0) largestIndex = index;
    }
    shares[largestIndex] = addMoney(shares[largestIndex]!, residue);
  }

  return shares;
}

/** DB serialisation: always a fixed-scale decimal string. */
export function toNumericString(value: MoneyValue): string {
  return value.amount;
}

export function fromNumericString(amount: string | null | undefined, currency: CurrencyCode): MoneyValue | null {
  if (amount === null || amount === undefined) return null;
  return money(amount, currency);
}
