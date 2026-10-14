import { DomainRuleError } from '@/shared/errors';
import {
  addMoney,
  compareMoney,
  displayScaleFor,
  isZeroMoney,
  money,
  subtractMoney,
  sumMoney,
  toDecimalValue,
  toNumericString,
  type MoneyValue,
} from '@/shared/money';
import Decimal from 'decimal.js';

export interface BillingLineSplitChangeOrder {
  readonly id: string;
  readonly reference: string | null;
  /** Approved net magnitude used as allocation weight. */
  readonly netAmount: MoneyValue;
}

export interface NetBillingLineDraft {
  readonly description: string;
  readonly lineTotal: string;
  readonly currency: string;
  readonly changeOrderId: string | null;
  readonly sortOrder: number;
}

function allocateMoneyByWeights(
  total: MoneyValue,
  weights: readonly MoneyValue[],
): MoneyValue[] {
  if (weights.length === 0) return [];
  const currency = total.currency;
  const weightDecimals = weights.map((w) => toDecimalValue(w));
  const weightSum = weightDecimals.reduce((acc, w) => acc.plus(w), new Decimal(0));
  if (weightSum.isZero()) {
    throw new DomainRuleError(
      'Change order net weights must be positive for line split',
      'billing.errors.changeOrderWeightsRequired',
    );
  }

  const scale = displayScaleFor(currency);
  const target = toDecimalValue(total).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
  const shares: MoneyValue[] = [];
  let allocated = new Decimal(0);

  for (let index = 0; index < weights.length; index += 1) {
    const isLast = index === weights.length - 1;
    const portion = isLast
      ? target.minus(allocated)
      : target.times(weightDecimals[index]!).dividedBy(weightSum).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
    allocated = allocated.plus(portion);
    shares.push(money(portion, currency));
  }

  const residue = subtractMoney(total, sumMoney(shares, currency));
  if (!isZeroMoney(residue) && shares.length > 0) {
    const lastIndex = shares.length - 1;
    shares[lastIndex] = addMoney(shares[lastIndex]!, residue);
  }

  return shares;
}

/**
 * Build billing_lines.line_total as net (pre-VAT) amounts that sum exactly to subtotal.
 */
export function buildNetBillingLines(input: {
  readonly subtotal: MoneyValue;
  readonly changeOrders: readonly BillingLineSplitChangeOrder[];
}): NetBillingLineDraft[] {
  const { subtotal, changeOrders } = input;
  const currency = subtotal.currency;

  if (changeOrders.length === 0) {
    return [
      {
        description: 'Billing amount',
        lineTotal: toNumericString(subtotal),
        currency,
        changeOrderId: null,
        sortOrder: 0,
      },
    ];
  }

  const weights = changeOrders.map((co) => co.netAmount);
  const shares = allocateMoneyByWeights(subtotal, weights);

  return changeOrders.map((changeOrder, index) => ({
    description: changeOrder.reference?.trim() || `Change order ${index + 1}`,
    lineTotal: toNumericString(shares[index]!),
    currency,
    changeOrderId: changeOrder.id,
    sortOrder: index,
  }));
}

/** Verify line net totals re-sum to subtotal (test helper / guard). */
export function assertNetBillingLinesSumToSubtotal(
  lines: readonly { lineTotal: MoneyValue }[],
  subtotal: MoneyValue,
): void {
  if (lines.length === 0) return;
  const sum = sumMoney(
    lines.map((line) => line.lineTotal),
    subtotal.currency,
  );
  if (compareMoney(sum, subtotal) !== 0) {
    throw new DomainRuleError(
      'Billing line net totals must equal subtotal',
      'billing.errors.lineNetMismatch',
      { expected: subtotal.amount, actual: sum.amount },
    );
  }
}
