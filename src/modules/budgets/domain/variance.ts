import { computeForecastFinalCost } from '@/modules/financials/domain/cost-aggregation';
import type { CostPosition } from '@/modules/financials/domain/types';
import {
  fromNumericString,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money/money';

/**
 * One control view over Budget + the shared financial engine.
 *
 * Never recalculates Actual — callers pass CostPosition from
 * `compose-project-financials` / `getProjectFinancials`.
 *
 * Variance = Budget − Forecast (positive = under budget / favorable).
 */
export interface BudgetControlPosition {
  readonly budget: MoneyValue;
  readonly actual: MoneyValue;
  readonly remainingCommitment: MoneyValue;
  readonly etc: MoneyValue;
  readonly forecast: MoneyValue;
  readonly variance: MoneyValue;
}

export interface ComposeBudgetControlInput {
  readonly budgetAmount: MoneyValue | string | null;
  readonly currency: string;
  /** Engine cost position — required for Actual / Commitment / ETC / Forecast. */
  readonly cost: CostPosition | null;
}

export function moneyFromBudgetAmount(
  amount: MoneyValue | string | null | undefined,
  currency: string,
): MoneyValue {
  if (amount && typeof amount === 'object' && 'amount' in amount && 'currency' in amount) {
    return amount;
  }
  if (typeof amount === 'string') {
    return fromNumericString(amount, currency) ?? zeroMoney(currency);
  }
  return zeroMoney(currency);
}

export function composeBudgetControlPosition(
  input: ComposeBudgetControlInput,
): BudgetControlPosition {
  const currency = input.currency.toUpperCase();
  const budget = moneyFromBudgetAmount(input.budgetAmount, currency);

  if (!input.cost) {
    const zero = zeroMoney(currency);
    return {
      budget,
      actual: zero,
      remainingCommitment: zero,
      etc: zero,
      forecast: zero,
      variance: budget,
    };
  }

  const actual = input.cost.actualCostToDate;
  const remainingCommitment = input.cost.committedOpen;
  const etc = input.cost.expectedRemainingCost;
  const forecast =
    input.cost.estimatedFinalCost.currency === currency
      ? input.cost.estimatedFinalCost
      : computeForecastFinalCost({
          actualCostToDate: actual,
          remainingCommitments: remainingCommitment,
          expectedRemainingCost: etc,
        });

  return {
    budget,
    actual,
    remainingCommitment,
    etc,
    forecast,
    variance: subtractMoney(budget, forecast),
  };
}

/** Pure variance helper for unit tests — Budget − Forecast. */
export function computeBudgetVariance(budget: MoneyValue, forecast: MoneyValue): MoneyValue {
  return subtractMoney(budget, forecast);
}
