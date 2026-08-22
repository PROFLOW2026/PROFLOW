/**
 * Billing-plan line math — percent ↔ amount, cumulative, remaining, overbill, rounding.
 * Uses decimal.js / MoneyValue only — never IEEE floats.
 */

import Decimal from 'decimal.js';
import { DomainRuleError } from '@/shared/errors';
import {
  addMoney,
  compareMoney,
  displayScaleFor,
  money,
  percentOfMoney,
  subtractMoney,
  toDecimalValue,
  toNumericString,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -9e15, toExpPos: 9e15 });

/** Percent storage scale matching cycle line columns (numeric 12,8). */
export const PERCENT_STORAGE_SCALE = 8;

function parsePercent(raw: string | number | Decimal): Decimal {
  if (typeof raw === 'number') {
    throw new DomainRuleError(
      'Percent must be a decimal string, not a JS number',
      'billingPlan.errors.invalidPercent',
    );
  }
  const value = raw instanceof Decimal ? raw : new Decimal(String(raw).trim() || '0');
  if (!value.isFinite()) {
    throw new DomainRuleError('Percent must be finite', 'billingPlan.errors.invalidPercent');
  }
  if (value.isNegative()) {
    throw new DomainRuleError('Percent cannot be negative', 'billingPlan.errors.invalidPercent');
  }
  return value;
}

export function percentString(raw: string | number | Decimal, scale = PERCENT_STORAGE_SCALE): string {
  return parsePercent(raw).toFixed(scale);
}

/** Amount = base × (percent / 100), money-rounded to storage scale. */
export function deriveAmountFromPercent(base: MoneyValue, percent: string): MoneyValue {
  return percentOfMoney(base, parsePercent(percent));
}

/**
 * Percent = (amount / base) × 100.
 * Returns 0 when base is zero (avoids divide-by-zero); amount must then also be zero.
 */
export function derivePercentFromAmount(base: MoneyValue, amount: MoneyValue): string {
  if (base.currency !== amount.currency) {
    throw new DomainRuleError(
      'Currency mismatch for percent derivation',
      'billingPlan.errors.currencyMismatch',
    );
  }
  const baseDec = toDecimalValue(base);
  if (baseDec.isZero()) {
    if (!toDecimalValue(amount).isZero()) {
      throw new DomainRuleError(
        'Cannot derive percent from a non-zero amount against a zero base',
        'billingPlan.errors.invalidPercent',
      );
    }
    return percentString('0');
  }
  return percentString(toDecimalValue(amount).times(100).dividedBy(baseDec));
}

export function computeCumulative(prior: MoneyValue, current: MoneyValue): MoneyValue {
  return addMoney(prior, current);
}

export function computeRemaining(base: MoneyValue, cumulative: MoneyValue): MoneyValue {
  return subtractMoney(base, cumulative);
}

/**
 * Ensures prior + current ≤ agreed line base (overbilling guard).
 * Throws DomainRuleError with billingPlan.errors.overbill.
 */
export function assertWithinLineCap(
  base: MoneyValue,
  prior: MoneyValue,
  current: MoneyValue,
): void {
  if (compareMoney(current, zeroMoney(current.currency)) < 0) {
    throw new DomainRuleError(
      'Current billing amount cannot be negative',
      'billingPlan.errors.negativeAmount',
    );
  }
  if (compareMoney(prior, zeroMoney(prior.currency)) < 0) {
    throw new DomainRuleError(
      'Prior billed amount cannot be negative',
      'billingPlan.errors.negativeAmount',
    );
  }
  const cumulative = computeCumulative(prior, current);
  if (compareMoney(cumulative, base) > 0) {
    throw new DomainRuleError(
      'Cumulative billed amount exceeds the agreed line amount',
      'billingPlan.errors.overbill',
      {
        base: toNumericString(base),
        prior: toNumericString(prior),
        current: toNumericString(current),
        cumulative: toNumericString(cumulative),
      },
    );
  }
}

const DEFAULT_CLOSE_PERCENT_TOLERANCE = '0.0001';

/**
 * Resolve current slice from percent or amount (amount wins when both set),
 * and when the remainder would close the line (near 100% / last minor units),
 * allocate the exact remaining amount so cumulative equals base.
 */
export function allocateFinalSlice(input: {
  readonly base: MoneyValue;
  readonly priorAmount: MoneyValue;
  readonly requestedAmount?: string | MoneyValue | null;
  readonly requestedPercent?: string | null;
  /** Percent points from 100 at which we close exactly. Default 0.0001. */
  readonly closePercentTolerance?: string;
}): {
  readonly currentAmount: MoneyValue;
  readonly currentPercent: string;
  readonly cumulativeAmount: MoneyValue;
  readonly cumulativePercent: string;
  readonly remainingAmount: MoneyValue;
  readonly closedExactly: boolean;
} {
  const currency = input.base.currency;
  const prior =
    typeof input.priorAmount === 'object'
      ? input.priorAmount
      : money(String(input.priorAmount), currency);
  const remaining = computeRemaining(input.base, prior);

  if (compareMoney(remaining, zeroMoney(currency)) <= 0) {
    const cumPct = derivePercentFromAmount(input.base, prior);
    return {
      currentAmount: zeroMoney(currency),
      currentPercent: percentString('0'),
      cumulativeAmount: prior,
      cumulativePercent: cumPct,
      remainingAmount: zeroMoney(currency),
      closedExactly: true,
    };
  }

  let requested: MoneyValue;
  const amountRaw = input.requestedAmount;
  if (amountRaw != null && amountRaw !== '') {
    requested =
      typeof amountRaw === 'object' && 'amount' in amountRaw
        ? amountRaw
        : money(String(amountRaw), currency);
  } else if (input.requestedPercent != null && String(input.requestedPercent).trim() !== '') {
    requested = deriveAmountFromPercent(input.base, String(input.requestedPercent));
  } else {
    requested = zeroMoney(currency);
  }

  const priorPercent = derivePercentFromAmount(input.base, prior);
  const requestedPercent = derivePercentFromAmount(input.base, requested);
  const projectedCumPercent = parsePercent(priorPercent).plus(parsePercent(requestedPercent));
  const closeTol = parsePercent(input.closePercentTolerance ?? DEFAULT_CLOSE_PERCENT_TOLERANCE);
  const remainingPercent = new Decimal(100).minus(parsePercent(priorPercent));

  const scale = displayScaleFor(currency);
  const minor = new Decimal(10).pow(-scale);
  const remainingDec = toDecimalValue(remaining);
  const closeByMoney = remainingDec.lessThanOrEqualTo(minor) || compareMoney(requested, remaining) >= 0;
  const closeByPercent =
    remainingPercent.lessThanOrEqualTo(closeTol) ||
    projectedCumPercent.greaterThanOrEqualTo(new Decimal(100).minus(closeTol));

  let current = requested;
  let closedExactly = false;
  if (closeByMoney || closeByPercent) {
    current = remaining;
    closedExactly = true;
  }

  assertWithinLineCap(input.base, prior, current);

  const cumulative = computeCumulative(prior, current);
  const rem = computeRemaining(input.base, cumulative);

  return {
    currentAmount: current,
    currentPercent: derivePercentFromAmount(input.base, current),
    cumulativeAmount: cumulative,
    cumulativePercent: derivePercentFromAmount(input.base, cumulative),
    remainingAmount: rem,
    closedExactly,
  };
}

/** Effective agreed base for a line: current agreed (snapshot is historical only). */
export function effectiveLineBase(input: {
  readonly agreedAmount: string;
  readonly currency: string;
}): MoneyValue {
  return money(input.agreedAmount, input.currency);
}

/**
 * Agreed amount may not drop below already-billed cumulative.
 * Editing agreed only changes remaining for the unbilled portion.
 */
export function assertAgreedAmountAllowsBilled(input: {
  readonly newAgreedAmount: MoneyValue;
  readonly billedCumulative: MoneyValue;
}): void {
  if (compareMoney(input.newAgreedAmount, input.billedCumulative) < 0) {
    throw new DomainRuleError(
      'Agreed amount cannot be less than already billed cumulative',
      'billingPlan.errors.agreedBelowBilled',
      {
        agreed: toNumericString(input.newAgreedAmount),
        billed: toNumericString(input.billedCumulative),
      },
    );
  }
}
