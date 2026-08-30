import type { ProjectFinancials } from '../domain/types';
import { computeUnbilledBacklog } from '../domain/management-analytics';
import { resolveProjectProfitabilityDisplay } from '../domain/project-profitability-display';
import { resolveForecastCostBasis } from '../domain/resolve-forecast-cost-basis';
import { DEFAULT_PROJECT_PROFITABILITY_MODE } from '@/modules/tenancy/domain/project-profitability-mode';
import { subtractMoney, type MoneyValue } from '@/shared/money';

/**
 * Optional Wave-2 fields Agents 1/4 may attach without breaking older payloads.
 * Canonical Agent 2 fields: cost.expectedRemainingCost, profit.actualProfit,
 * profit.estimatedProfit (= forecast margin), cost.estimatedFinalCost (= direct forecast final).
 */
export type ProjectFinancialsWithOptionalKpis = ProjectFinancials & {
  readonly cost?: ProjectFinancials['cost'] & {
    readonly allocatedOverhead?: MoneyValue;
    /** Alias - prefer directForecastFinalCost. */
    readonly forecastCost?: MoneyValue;
  };
  readonly profit?: (NonNullable<ProjectFinancials['profit']> & {
    /** Alias - prefer actualProfit. */
    readonly actualMargin?: MoneyValue;
    /** Alias - prefer estimatedProfit. */
    readonly forecastMargin?: MoneyValue;
    readonly forecastMarginPercent?: string | null;
  }) | null;
  /** Transitional payloads may omit confidence until compose attaches it. */
  readonly dataConfidence?: ProjectFinancials['dataConfidence'];
};

export interface ResolvedProjectKpis {
  readonly currentContract: MoneyValue | null;
  readonly actualCost: MoneyValue;
  readonly directActualCost: MoneyValue;
  readonly fullActualCost: MoneyValue;
  readonly allocatedOverhead: MoneyValue;
  readonly committed: MoneyValue;
  readonly expectedRemainingCost: MoneyValue;
  readonly forecastCost: MoneyValue;
  readonly directForecastCost: MoneyValue;
  readonly fullForecastCost: MoneyValue;
  readonly futureGeneralAllocatedForecast: MoneyValue;
  readonly billed: MoneyValue;
  readonly paid: MoneyValue;
  readonly outstanding: MoneyValue;
  /** Contract net − net billed; null when no revenue basis or billing unavailable. */
  readonly unbilled: MoneyValue | null;
  readonly actualMargin: MoneyValue | null;
  readonly afterGeneralProfit: MoneyValue | null;
  readonly showBothProfits: boolean;
  readonly forecastMargin: MoneyValue | null;
  readonly fullForecastMargin: MoneyValue | null;
  readonly actualMarginPercent: string | null;
  readonly afterGeneralProfitPercent: string | null;
  readonly forecastMarginPercent: string | null;
  /** True when primary Forecast Final Cost equals primary Actual (no remaining commitments / ETC). */
  readonly forecastEqualsActual: boolean;
  /**
   * Open-price job: cost forecast OK; margins null - show price-not-set copy.
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
  const mode = financials.projectProfitabilityMode ?? DEFAULT_PROJECT_PROFITABILITY_MODE;

  const allocatedOverhead = cost.allocatedOverhead ?? cost.overheadActual;
  const expectedRemainingCost = cost.expectedRemainingCost;
  const futureGeneralAllocatedForecast = cost.futureGeneralAllocatedForecast;
  const forecastBasis = resolveForecastCostBasis(mode, cost);
  const forecastCost = cost.forecastCost ?? forecastBasis.primaryForecastFinalCost;

  const profitability = resolveProjectProfitabilityDisplay(
    mode,
    cost,
    commercial?.currentContractValue ?? null,
    priceNotSet,
  );

  let actualMargin: MoneyValue | null =
    profit?.actualMargin ?? profit?.actualProfit ?? null;
  let forecastMargin: MoneyValue | null =
    profit?.forecastMargin ?? profit?.estimatedProfit ?? null;
  let fullForecastMargin: MoneyValue | null = null;

  if (priceNotSet) {
    actualMargin = null;
    forecastMargin = null;
  } else if (commercial) {
    if (!actualMargin) {
      actualMargin = profitability.primaryProfit;
    }
    if (!forecastMargin) {
      forecastMargin = subtractMoney(commercial.currentContractValue, forecastCost);
    }
    fullForecastMargin = subtractMoney(
      commercial.currentContractValue,
      forecastBasis.fullForecastFinalCost,
    );
  }

  const forecastEqualsActual =
    profitability.primaryActualCost.amount === forecastCost.amount &&
    profitability.primaryActualCost.currency === forecastCost.currency;

  const unbilled =
    !priceNotSet && commercial
      ? computeUnbilledBacklog(
          commercial.currentContractValue,
          financials.billing.netInvoiced,
          financials.billing.invoiced,
        )
      : null;

  return {
    currentContract: priceNotSet ? null : (commercial?.currentContractValue ?? null),
    actualCost: profitability.primaryActualCost,
    directActualCost: profitability.directActualCost,
    fullActualCost: profitability.fullActualCost,
    allocatedOverhead,
    committed: cost.committedOpen,
    expectedRemainingCost,
    forecastCost,
    directForecastCost: forecastBasis.directForecastFinalCost,
    fullForecastCost: forecastBasis.fullForecastFinalCost,
    futureGeneralAllocatedForecast,
    billed: financials.billing.invoiced,
    paid: financials.billing.paid,
    outstanding: financials.billing.outstanding,
    unbilled,
    actualMargin,
    afterGeneralProfit: profitability.showBothProfits
      ? profitability.afterGeneralProfit
      : null,
    showBothProfits: profitability.showBothProfits,
    forecastMargin,
    fullForecastMargin,
    actualMarginPercent: priceNotSet
      ? null
      : (profit?.actualMarginPercent ?? profitability.primaryProfitPercent),
    afterGeneralProfitPercent: priceNotSet ? null : profitability.afterGeneralProfitPercent,
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
