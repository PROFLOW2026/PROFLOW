import type { ProjectFinancials } from '../domain/types';
import { subtractMoney, type MoneyValue } from '@/shared/money';

/**
 * Optional Wave-2 fields Agents 1/4 may attach without breaking older payloads.
 * Canonical Agent 2 fields: cost.expectedRemainingCost, profit.actualProfit,
 * profit.estimatedProfit (= forecast margin), cost.estimatedFinalCost (= forecast final).
 */
export type ProjectFinancialsWithOptionalKpis = ProjectFinancials & {
  readonly cost?: ProjectFinancials['cost'] & {
    readonly allocatedOverhead?: MoneyValue;
    /** Alias — prefer estimatedFinalCost (Forecast Final Cost). */
    readonly forecastCost?: MoneyValue;
  };
  readonly profit?: (NonNullable<ProjectFinancials['profit']> & {
    /** Alias — prefer actualProfit. */
    readonly actualMargin?: MoneyValue;
    /** Alias — prefer estimatedProfit. */
    readonly forecastMargin?: MoneyValue;
    readonly forecastMarginPercent?: string | null;
  }) | null;
  /** Transitional payloads may omit confidence until compose attaches it. */
  readonly dataConfidence?: ProjectFinancials['dataConfidence'];
};

export interface ResolvedProjectKpis {
  readonly currentContract: MoneyValue | null;
  readonly actualCost: MoneyValue;
  readonly allocatedOverhead: MoneyValue;
  readonly committed: MoneyValue;
  readonly expectedRemainingCost: MoneyValue;
  readonly forecastCost: MoneyValue;
  readonly billed: MoneyValue;
  readonly paid: MoneyValue;
  readonly outstanding: MoneyValue;
  readonly actualMargin: MoneyValue | null;
  readonly forecastMargin: MoneyValue | null;
  readonly actualMarginPercent: string | null;
  readonly forecastMarginPercent: string | null;
  /** True when Forecast Final Cost equals Actual (no remaining commitments / ETC). */
  readonly forecastEqualsActual: boolean;
  /**
   * Open-price job: cost forecast OK; margins null — show price-not-set copy.
   * Never derive a fake −loss from revenue = 0.
   */
  readonly priceNotSet: boolean;
}

/**
 * Maps project financials into labelled KPI values for explainability UI.
 * Reads Agent 2 forecast fields; optional aliases remain for transitional UI.
 */
export function resolveProjectKpiDisplay(
  financials: ProjectFinancialsWithOptionalKpis,
): ResolvedProjectKpis {
  const cost = financials.cost;
  const commercial = financials.commercial;
  const profit = financials.profit;
  const priceNotSet = financials.priceNotSet === true;

  const allocatedOverhead = cost.allocatedOverhead ?? cost.overheadActual;
  const forecastCost = cost.forecastCost ?? cost.estimatedFinalCost;
  const expectedRemainingCost = cost.expectedRemainingCost;

  let actualMargin: MoneyValue | null =
    profit?.actualMargin ?? profit?.actualProfit ?? null;
  let forecastMargin: MoneyValue | null =
    profit?.forecastMargin ?? profit?.estimatedProfit ?? null;

  if (priceNotSet) {
    // Do not fall back to contract(0) − cost (= fake loss).
    actualMargin = null;
    forecastMargin = null;
  } else if (commercial) {
    if (!actualMargin) {
      actualMargin = subtractMoney(commercial.currentContractValue, cost.actualCostToDate);
    }
    if (!forecastMargin) {
      forecastMargin = subtractMoney(commercial.currentContractValue, forecastCost);
    }
  }

  const forecastEqualsActual =
    cost.actualCostToDate.amount === forecastCost.amount &&
    cost.actualCostToDate.currency === forecastCost.currency;

  return {
    currentContract: priceNotSet ? null : (commercial?.currentContractValue ?? null),
    actualCost: cost.actualCostToDate,
    allocatedOverhead,
    committed: cost.committedOpen,
    expectedRemainingCost,
    forecastCost,
    billed: financials.billing.invoiced,
    paid: financials.billing.paid,
    outstanding: financials.billing.outstanding,
    actualMargin,
    forecastMargin,
    actualMarginPercent: priceNotSet ? null : (profit?.actualMarginPercent ?? null),
    forecastMarginPercent: priceNotSet
      ? null
      : (profit?.forecastMarginPercent ?? profit?.marginPercent ?? null),
    forecastEqualsActual,
    priceNotSet,
  };
}

/** Convenience for tests / callers that only need currency-tagged zeros check. */
export function moneyKey(value: MoneyValue): string {
  return `${value.currency}:${value.amount}`;
}
