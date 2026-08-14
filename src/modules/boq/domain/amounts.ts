import Decimal from 'decimal.js';
import { money, multiplyMoney, toNumericString, type MoneyValue } from '@/shared/money';
import type { BoqPricingType } from './types';

/**
 * Deterministic BOQ amount math — decimal.js only, never IEEE floats.
 */

export function parseQuantity(raw: string | number | Decimal): Decimal {
  if (typeof raw === 'number') {
    throw new Error('BOQ quantity must be a decimal string, not a JS number');
  }
  const value = raw instanceof Decimal ? raw : new Decimal(String(raw).trim() || '0');
  if (!value.isFinite()) throw new Error('BOQ quantity must be finite');
  return value;
}

export function quantityString(raw: string | number | Decimal): string {
  return parseQuantity(raw).toFixed();
}

export function computeLineAmount(input: {
  readonly pricingType: BoqPricingType;
  readonly quantity: string;
  readonly unitPrice: MoneyValue;
}): MoneyValue {
  if (input.pricingType === 'lump_sum') {
    return money(toNumericString(input.unitPrice), input.unitPrice.currency);
  }
  return multiplyMoney(input.unitPrice, parseQuantity(input.quantity));
}

export function recomputeCurrentFromOriginal(input: {
  readonly pricingType: BoqPricingType;
  readonly originalQuantity: string;
  readonly originalUnitPrice: MoneyValue;
  readonly quantityDelta: string;
  readonly unitPriceDelta: MoneyValue;
}): {
  readonly currentQuantity: string;
  readonly currentUnitPrice: MoneyValue;
  readonly currentAmount: MoneyValue;
} {
  const qty = parseQuantity(input.originalQuantity).plus(parseQuantity(input.quantityDelta));
  const unitPrice = money(
    new Decimal(toNumericString(input.originalUnitPrice))
      .plus(toNumericString(input.unitPriceDelta))
      .toFixed(),
    input.originalUnitPrice.currency,
  );
  const amount = computeLineAmount({
    pricingType: input.pricingType,
    quantity: qty.toFixed(),
    unitPrice,
  });
  return {
    currentQuantity: qty.toFixed(),
    currentUnitPrice: unitPrice,
    currentAmount: amount,
  };
}

export function percentComplete(input: {
  readonly cumulativeApproved: string;
  readonly currentQuantity: string;
}): string {
  const current = parseQuantity(input.currentQuantity);
  if (current.isZero()) return '0';
  return parseQuantity(input.cumulativeApproved).dividedBy(current).times(100).toDecimalPlaces(4).toFixed();
}

export function remainingQuantity(input: {
  readonly currentQuantity: string;
  readonly cumulativeApproved: string;
}): string {
  return parseQuantity(input.currentQuantity)
    .minus(parseQuantity(input.cumulativeApproved))
    .toFixed();
}

export function assertWithinCurrentQuantity(input: {
  readonly currentQuantity: string;
  readonly cumulativeApprovedAfter: string;
  readonly allowExact?: boolean;
}): void {
  const current = parseQuantity(input.currentQuantity);
  const after = parseQuantity(input.cumulativeApprovedAfter);
  if (after.greaterThan(current)) {
    throw new Error(
      `Over-measurement: cumulative approved ${after.toFixed()} exceeds current quantity ${current.toFixed()}`,
    );
  }
  if (after.isNegative()) {
    throw new Error('Cumulative approved quantity cannot be negative');
  }
}

export function assertQuantityReductionSafe(input: {
  readonly newCurrentQuantity: string;
  readonly cumulativeApprovedOrBilled: string;
}): void {
  const next = parseQuantity(input.newCurrentQuantity);
  const locked = parseQuantity(input.cumulativeApprovedOrBilled);
  if (next.lessThan(locked)) {
    throw new Error(
      `Cannot reduce current quantity to ${next.toFixed()} below already approved/billed ${locked.toFixed()}`,
    );
  }
}

export function periodLineValue(input: {
  readonly approvedThisPeriod: string;
  readonly unitPrice: MoneyValue;
  readonly pricingType: BoqPricingType;
}): MoneyValue {
  if (input.pricingType === 'lump_sum') {
    // Lump-sum progress: approved quantity is treated as fraction 0–1 of lump amount when ≤1,
    // otherwise as absolute currency share via quantity × unitPrice (unitPrice holds lump).
    const q = parseQuantity(input.approvedThisPeriod);
    if (q.greaterThan(0) && q.lessThanOrEqualTo(1)) {
      return multiplyMoney(input.unitPrice, q);
    }
  }
  return multiplyMoney(input.unitPrice, parseQuantity(input.approvedThisPeriod));
}

export function sumDecimalStrings(values: readonly string[]): string {
  return values
    .reduce((acc, value) => acc.plus(parseQuantity(value)), new Decimal(0))
    .toFixed();
}
