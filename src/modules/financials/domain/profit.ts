import Decimal from 'decimal.js';
import type { ProfitPosition } from '@/modules/financials/domain/types';
import {
  isZeroMoney,
  roundMoney,
  subtractMoney,
  toDecimalValue,
  type MoneyValue,
} from '@/shared/money';

/**
 * Forecast profit arithmetic (doc 04 §10).
 *
 * Margin is intentionally null when contract value is zero — dividing by zero
 * would produce a meaningless percentage.
 */
export function computeProfitPosition(
  currentContractValue: MoneyValue,
  estimatedFinalCost: MoneyValue,
): ProfitPosition {
  const estimatedProfit = subtractMoney(currentContractValue, estimatedFinalCost);
  const marginPercent = isZeroMoney(currentContractValue)
    ? null
    : computeMarginPercent(estimatedProfit, currentContractValue);

  return { estimatedProfit, marginPercent };
}

export function computeMarginPercent(profit: MoneyValue, contractValue: MoneyValue): string {
  const margin = toDecimalValue(profit)
    .dividedBy(toDecimalValue(contractValue))
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return margin.toFixed(2);
}

/** Profit rounded to the currency minor unit for display consistency. */
export function roundProfitPosition(position: ProfitPosition): ProfitPosition {
  return {
    estimatedProfit: roundMoney(position.estimatedProfit),
    marginPercent: position.marginPercent,
  };
}
