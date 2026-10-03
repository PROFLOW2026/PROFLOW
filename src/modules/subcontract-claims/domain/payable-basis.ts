import Decimal from 'decimal.js';
import {
  compareMoney,
  isNegativeMoney,
  isPositiveMoney,
  isZeroMoney,
  maxMoney,
  minMoney,
  money,
  multiplyMoney,
  negateMoney,
  percentOfMoney,
  roundMoney,
  subtractMoney,
  toDecimalValue,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { PayableBasisApStatus } from './types';

/**
 * Certification -> payable basis (NET). Each certification / reassessment appends one basis row with the
 * DELTA it adds to what was already certified for the claim:
 *
 *   payable = certified delta - retention - advance recovery - deductions applied
 *
 * - Retention is cash timing: it is held from the payable, never subtracted from certified work.
 *   Retention % of the delta, capped by the agreement retention cap (amount, or % of contract value).
 * - Advance recovery reuses `subcontract_advances` (paid - refunded is the recoverable pool):
 *   'proportional' = delta x (advances / contract value), 'fixed_percent_per_claim' = delta x %.
 * - Deductions are first-class records; outstanding (issued - reversed - already applied) is applied
 *   up to what remains payable, the rest carries to the next basis.
 * A negative delta (downward reassessment) releases retention / recovery proportionally and is flagged
 * `credit_required` for AP; it never creates or edits AP rows by itself. VAT is never computed here.
 */

export type AdvanceRecoveryMethod = 'none' | 'proportional' | 'fixed_percent_per_claim';

export interface PayableBasisInput {
  readonly currency: string;
  readonly certifiedTotal: MoneyValue;
  readonly previousCertifiedTotal: MoneyValue;
  readonly retentionPercent: string | null;
  /** Absolute cap on held retention for the agreement (already resolved from amount / percent). */
  readonly retentionCap: MoneyValue | null;
  /** Retention held by earlier bases of the agreement (sum of retention amounts). */
  readonly retentionHeldBefore: MoneyValue;
  readonly advance: {
    readonly method: AdvanceRecoveryMethod;
    readonly percent: string | null;
    /** Advances paid minus refunded (subcontract_advances). */
    readonly pool: MoneyValue;
    /** Recovery planned by earlier bases of the agreement. */
    readonly recoveredBefore: MoneyValue;
    /** Current approved contract value (for proportional recovery). */
    readonly contractValue: MoneyValue;
  };
  /** Deductions issued - reversed - applied by earlier bases (never negative). */
  readonly deductionsOutstanding: MoneyValue;
}

export interface PayableBasis {
  readonly certifiedTotal: MoneyValue;
  readonly certifiedDelta: MoneyValue;
  readonly retentionPercent: string | null;
  readonly retentionAmount: MoneyValue;
  readonly advanceRecoveryAmount: MoneyValue;
  readonly deductionsAmount: MoneyValue;
  readonly payableNet: MoneyValue;
  readonly apBillStatus: PayableBasisApStatus;
}

/**
 * Upward delta: take `raw`, limited to the remaining room (null = unlimited), never below zero.
 * Downward delta: give back proportionally, never more than what earlier bases took.
 */
function clampHeld(
  raw: MoneyValue,
  delta: MoneyValue,
  room: MoneyValue | null,
  heldBefore: MoneyValue,
): MoneyValue {
  const zero = zeroMoney(raw.currency);
  if (isPositiveMoney(delta)) {
    const limited = room === null ? raw : minMoney(raw, maxMoney(room, zero));
    return maxMoney(limited, zero);
  }
  return maxMoney(raw, negateMoney(heldBefore));
}

export function resolveRetentionCap(input: {
  readonly currency: string;
  readonly capAmount: string | null;
  readonly capPercent: string | null;
  readonly contractValue: MoneyValue;
}): MoneyValue | null {
  const caps: MoneyValue[] = [];
  if (input.capAmount !== null) caps.push(roundMoney(money(input.capAmount, input.currency)));
  if (input.capPercent !== null) caps.push(roundMoney(percentOfMoney(input.contractValue, input.capPercent)));
  if (caps.length === 0) return null;
  return caps.reduce((lowest, cap) => minMoney(lowest, cap));
}

export function computePayableBasis(input: PayableBasisInput): PayableBasis {
  const currency = input.currency;
  const zero = zeroMoney(currency);
  const delta = subtractMoney(input.certifiedTotal, input.previousCertifiedTotal);

  let retention = zero;
  if (input.retentionPercent !== null && !new Decimal(input.retentionPercent).isZero()) {
    const raw = roundMoney(percentOfMoney(delta, input.retentionPercent));
    const room = input.retentionCap ? subtractMoney(input.retentionCap, input.retentionHeldBefore) : null;
    retention = clampHeld(raw, delta, room, input.retentionHeldBefore);
  }

  let recovery = zero;
  const { advance } = input;
  if (advance.method !== 'none' && isPositiveMoney(advance.pool)) {
    let rate: Decimal | null = null;
    if (advance.method === 'fixed_percent_per_claim' && advance.percent !== null) {
      rate = new Decimal(advance.percent).dividedBy(100);
    } else if (advance.method === 'proportional' && isPositiveMoney(advance.contractValue)) {
      rate = toDecimalValue(advance.pool).dividedBy(toDecimalValue(advance.contractValue));
    }
    if (rate) {
      const raw = roundMoney(multiplyMoney(delta, rate));
      recovery = clampHeld(raw, delta, subtractMoney(advance.pool, advance.recoveredBefore), advance.recoveredBefore);
    }
  }

  let deductions = zero;
  const afterHolds = subtractMoney(subtractMoney(delta, retention), recovery);
  if (isPositiveMoney(afterHolds) && isPositiveMoney(input.deductionsOutstanding)) {
    deductions = minMoney(afterHolds, input.deductionsOutstanding);
  }

  const payableNet = subtractMoney(afterHolds, deductions);
  const apBillStatus: PayableBasisApStatus = isZeroMoney(payableNet)
    ? 'not_required'
    : isNegativeMoney(payableNet)
      ? 'credit_required'
      : 'pending';

  return {
    certifiedTotal: input.certifiedTotal,
    certifiedDelta: delta,
    retentionPercent: input.retentionPercent,
    retentionAmount: retention,
    advanceRecoveryAmount: recovery,
    deductionsAmount: deductions,
    payableNet,
    apBillStatus,
  };
}

/** Retention position of an agreement: held by bases, released through AP (retention_releases). */
export interface RetentionPosition {
  readonly percent: string | null;
  readonly cap: MoneyValue | null;
  readonly held: MoneyValue;
  readonly released: MoneyValue;
  readonly remaining: MoneyValue;
}

export function retentionPosition(input: {
  readonly percent: string | null;
  readonly cap: MoneyValue | null;
  readonly held: MoneyValue;
  readonly released: MoneyValue;
}): RetentionPosition {
  const remaining = subtractMoney(input.held, input.released);
  return {
    percent: input.percent,
    cap: input.cap,
    held: input.held,
    released: input.released,
    remaining: compareMoney(remaining, zeroMoney(remaining.currency)) < 0 ? zeroMoney(remaining.currency) : remaining,
  };
}
