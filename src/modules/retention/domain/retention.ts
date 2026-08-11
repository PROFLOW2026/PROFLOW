/**
 * Retention / holdback — cash timing only.
 *
 * Recognized Actual / invoiced stays the full bill or billing total.
 * Payable / receivable now = total − payments − credits − held remaining.
 * Releases are immutable events; they never rewrite history or invent a second cost.
 */

import { DomainRuleError } from '@/shared/errors';
import {
  compareMoney,
  isPositiveMoney,
  isZeroMoney,
  money,
  percentOfMoney,
  subtractMoney,
  toNumericString,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

export type RetentionSide = 'ap' | 'ar';
export type RetentionSourceType = 'vendor_bill' | 'billing_record';

export function retentionErrorKey(
  side: RetentionSide,
  name:
    | 'retentionInvalid'
    | 'retentionExceedsTotal'
    | 'retentionCannotIncrease'
    | 'retentionNotReleasable'
    | 'retentionReleaseExceedsHeld'
    | 'retentionReleaseAmountInvalid'
    | 'retentionReleaseDateFuture',
): string {
  const ns = side === 'ap' ? 'ap' : 'billing';
  return `${ns}.errors.${name}`;
}

function parseOptionalDecimal(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Resolve draft capture from an amount or a percent (10 = 10%).
 * Amount wins when both are provided. Zero when omitted.
 */
export function resolveRetentionCapture(input: {
  readonly totalAmount: string;
  readonly currency: string;
  readonly retentionAmount?: string | null;
  readonly retentionPercent?: string | null;
  readonly side: RetentionSide;
}): MoneyValue {
  const currency = input.currency.toUpperCase();
  const total = money(input.totalAmount, currency);
  const amountRaw = parseOptionalDecimal(input.retentionAmount);
  const percentRaw = parseOptionalDecimal(input.retentionPercent);

  let retention: MoneyValue;
  try {
    if (amountRaw) {
      retention = money(amountRaw, currency);
    } else if (percentRaw) {
      retention = percentOfMoney(total, percentRaw);
    } else {
      retention = zeroMoney(currency);
    }
  } catch {
    throw new DomainRuleError(
      'Retention amount is invalid',
      retentionErrorKey(input.side, 'retentionInvalid'),
    );
  }

  if (compareMoney(retention, zeroMoney(currency)) < 0) {
    throw new DomainRuleError(
      'Retention cannot be negative',
      retentionErrorKey(input.side, 'retentionInvalid'),
    );
  }
  if (compareMoney(retention, total) > 0) {
    throw new DomainRuleError(
      'Retention cannot exceed the total amount',
      retentionErrorKey(input.side, 'retentionExceedsTotal'),
    );
  }
  return retention;
}

/** After post/finalize, held remaining starts equal to captured retention. */
export function heldRemainingOnPost(retentionAmount: MoneyValue): string {
  return toNumericString(retentionAmount);
}

export function assertRetentionFitsTotal(
  retentionAmount: MoneyValue,
  totalAmount: MoneyValue,
  side: RetentionSide,
): void {
  if (compareMoney(retentionAmount, zeroMoney(totalAmount.currency)) < 0) {
    throw new DomainRuleError(
      'Retention cannot be negative',
      retentionErrorKey(side, 'retentionInvalid'),
    );
  }
  if (compareMoney(retentionAmount, totalAmount) > 0) {
    throw new DomainRuleError(
      'Retention cannot exceed the total amount',
      retentionErrorKey(side, 'retentionExceedsTotal'),
    );
  }
}

/** Posted/finalized records cannot increase retention_amount. */
export function assertRetentionNotIncreased(
  previous: MoneyValue,
  next: MoneyValue,
  side: RetentionSide,
): void {
  if (compareMoney(next, previous) > 0) {
    throw new DomainRuleError(
      'Retention cannot be increased after post; record a new bill or billing record',
      retentionErrorKey(side, 'retentionCannotIncrease'),
    );
  }
}

export function assertRetentionRelease(input: {
  readonly side: RetentionSide;
  readonly sourcePosted: boolean;
  readonly heldRemaining: MoneyValue;
  readonly amount: MoneyValue;
}): void {
  if (!input.sourcePosted) {
    throw new DomainRuleError(
      'Retention can only be released after the source is posted or finalized',
      retentionErrorKey(input.side, 'retentionNotReleasable'),
    );
  }
  if (!isPositiveMoney(input.amount)) {
    throw new DomainRuleError(
      'Release amount must be positive',
      retentionErrorKey(input.side, 'retentionReleaseAmountInvalid'),
    );
  }
  if (input.amount.currency !== input.heldRemaining.currency) {
    throw new DomainRuleError(
      'Release currency must match the source',
      retentionErrorKey(input.side, 'retentionInvalid'),
    );
  }
  if (compareMoney(input.amount, input.heldRemaining) > 0) {
    throw new DomainRuleError(
      'Release cannot exceed held remaining',
      retentionErrorKey(input.side, 'retentionReleaseExceedsHeld'),
    );
  }
}

export function releasedToDate(retentionAmount: MoneyValue, heldRemaining: MoneyValue): MoneyValue {
  const released = subtractMoney(retentionAmount, heldRemaining);
  if (compareMoney(released, zeroMoney(retentionAmount.currency)) < 0) {
    return zeroMoney(retentionAmount.currency);
  }
  return released;
}

export function hasHeldRetention(heldRemaining: MoneyValue): boolean {
  return isPositiveMoney(heldRemaining);
}

export function isZeroRetention(amount: MoneyValue): boolean {
  return isZeroMoney(amount);
}
