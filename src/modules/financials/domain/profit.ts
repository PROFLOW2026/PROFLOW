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
 * Profit / margin arithmetic (doc 04 §10; Wave 2 forecast engine).
 *
 * ACTUAL MARGIN  = Current Contract Net − Actual Total Cost
 * FORECAST MARGIN = Current Contract Net − Forecast Final Cost
 *
 * `estimatedProfit` / `marginPercent` remain the forecast pair for UI compatibility.
 * Margin is null when contract value is zero - dividing by zero is meaningless.
 */
export function computeProfitPosition(
  currentContractValue: MoneyValue,
  estimatedFinalCost: MoneyValue,
  actualCostToDate: MoneyValue = estimatedFinalCost,
): ProfitPosition {
  const estimatedProfit = subtractMoney(currentContractValue, estimatedFinalCost);
  const actualProfit = subtractMoney(currentContractValue, actualCostToDate);
  const marginPercent = isZeroMoney(currentContractValue)
    ? null
    : computeMarginPercent(estimatedProfit, currentContractValue);
  const actualMarginPercent = isZeroMoney(currentContractValue)
    ? null
    : computeMarginPercent(actualProfit, currentContractValue);

  return { estimatedProfit, marginPercent, actualProfit, actualMarginPercent };
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
    actualProfit: roundMoney(position.actualProfit),
    actualMarginPercent: position.actualMarginPercent,
  };
}
