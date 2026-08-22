/**
 * Approval math for progress-account cycles.
 * Cumulative billed uses approved amounts only; unapproved remains billable later.
 */

import {
  computeCumulative,
  computeRemaining,
  deriveAmountFromPercent,
  derivePercentFromAmount,
  percentString,
} from './line-math';
import { resolveCycleLineRetention } from './retention-math';
import {
  compareMoney,
  money,
  subtractMoney,
  toNumericString,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

export function unapprovedAmount(
  requested: MoneyValue,
  approved: MoneyValue | null | undefined,
): MoneyValue {
  if (approved == null) return requested;
  return subtractMoney(requested, approved);
}

export function cumulativeApproved(
  priorApproved: MoneyValue,
  approvedThisCycle: MoneyValue,
): MoneyValue {
  return computeCumulative(priorApproved, approvedThisCycle);
}

export function remainingAfterApproved(
  base: MoneyValue,
  cumulativeApprovedAmount: MoneyValue,
): MoneyValue {
  return computeRemaining(base, cumulativeApprovedAmount);
}

/**
 * Resolve an approval slice from amount or percent (amount wins when both set),
 * capped so approved ≤ requested and prior+approved ≤ base.
 */
export function resolveApprovalSlice(input: {
  readonly base: MoneyValue;
  readonly priorApproved: MoneyValue;
  readonly requestedAmount: MoneyValue;
  readonly approvedAmount?: string | MoneyValue | null;
  readonly approvedPercent?: string | null;
}): {
  readonly approvedAmount: MoneyValue;
  readonly approvedPercent: string;
  readonly unapprovedAmount: MoneyValue;
  readonly cumulativeApproved: MoneyValue;
  readonly remainingAmount: MoneyValue;
} {
  const currency = input.base.currency;
  let approved: MoneyValue;
  const amountRaw = input.approvedAmount;
  if (amountRaw != null && amountRaw !== '') {
    approved =
      typeof amountRaw === 'object' && 'amount' in amountRaw
        ? amountRaw
        : money(String(amountRaw), currency);
  } else if (input.approvedPercent != null && String(input.approvedPercent).trim() !== '') {
    approved = deriveAmountFromPercent(input.base, String(input.approvedPercent));
  } else {
    approved = input.requestedAmount;
  }

  if (compareMoney(approved, zeroMoney(currency)) < 0) {
    approved = zeroMoney(currency);
  }
  if (compareMoney(approved, input.requestedAmount) > 0) {
    approved = input.requestedAmount;
  }

  const remainingCap = computeRemaining(input.base, input.priorApproved);
  if (compareMoney(approved, remainingCap) > 0) {
    approved = remainingCap;
  }

  const cumulative = cumulativeApproved(input.priorApproved, approved);
  const remaining = remainingAfterApproved(input.base, cumulative);

  return {
    approvedAmount: approved,
    approvedPercent: derivePercentFromAmount(input.base, approved),
    unapprovedAmount: unapprovedAmount(input.requestedAmount, approved),
    cumulativeApproved: cumulative,
    remainingAmount: remaining,
  };
}

/** Retention is calculated on the approved (billable) amount. */
export function retentionOnApproved(input: {
  readonly approvedAmount: MoneyValue;
  readonly retentionPercent?: string | null;
  readonly retentionAmount?: string | null;
}): MoneyValue {
  return resolveCycleLineRetention({
    lineAmount: toNumericString(input.approvedAmount),
    currency: input.approvedAmount.currency,
    retentionPercent: input.retentionPercent,
    retentionAmount: input.retentionAmount,
  });
}

export function approvalPercentString(raw: string): string {
  return percentString(raw);
}
