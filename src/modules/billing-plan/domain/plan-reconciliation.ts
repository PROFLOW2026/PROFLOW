/**
 * Contract vs planned vs billed vs unplanned reconciliation for a billing plan.
 */

import Decimal from 'decimal.js';
import {
  compareMoney,
  money,
  subtractMoney,
  sumMoney,
  toNumericString,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { derivePercentFromAmount } from './line-math';
import type { PlanLineProgress, PlanReconciliation } from './types';

export function reconcileBillingPlan(input: {
  readonly currency: string;
  readonly contractValue: MoneyValue | string;
  readonly lines: readonly {
    readonly planLineId: string;
    readonly agreedAmount: string;
    readonly billedAmount: string;
  }[];
}): PlanReconciliation {
  const currency = input.currency.toUpperCase();
  const contractValue =
    typeof input.contractValue === 'string'
      ? money(input.contractValue, currency)
      : input.contractValue;

  const plannedParts: MoneyValue[] = [];
  const billedParts: MoneyValue[] = [];
  const lineProgress: PlanLineProgress[] = [];

  for (const line of input.lines) {
    const agreed = money(line.agreedAmount, currency);
    const billed = money(line.billedAmount, currency);
    plannedParts.push(agreed);
    billedParts.push(billed);
    const remaining = subtractMoney(agreed, billed);
    lineProgress.push({
      planLineId: line.planLineId,
      agreedAmount: toNumericString(agreed),
      billedAmount: toNumericString(billed),
      remainingAmount: toNumericString(remaining),
      billedPercent: derivePercentFromAmount(agreed, billed),
    });
  }

  const plannedTotal =
    plannedParts.length === 0 ? zeroMoney(currency) : sumMoney(plannedParts, currency);
  const billedTotal =
    billedParts.length === 0 ? zeroMoney(currency) : sumMoney(billedParts, currency);
  const unplannedAmount = subtractMoney(contractValue, plannedTotal);
  const remainingPlanned = subtractMoney(plannedTotal, billedTotal);
  const overPlanned = compareMoney(plannedTotal, contractValue) > 0;

  return {
    currency,
    contractValue: toNumericString(contractValue),
    plannedTotal: toNumericString(plannedTotal),
    billedTotal: toNumericString(billedTotal),
    unplannedAmount: toNumericString(unplannedAmount),
    remainingPlanned: toNumericString(remainingPlanned),
    overPlanned,
    lines: lineProgress,
  };
}

/** Sum of agreed line amounts as a share of contract (informational). */
export function plannedCoveragePercent(plannedTotal: MoneyValue, contractValue: MoneyValue): string {
  if (new Decimal(contractValue.amount).isZero()) return '0.00000000';
  return derivePercentFromAmount(contractValue, plannedTotal);
}
