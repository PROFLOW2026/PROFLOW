import type { MoneyValue } from '@/shared/money';
import type {
  ProjectFinancialKpiAvailability,
  ProjectKpiAvailability,
} from './financial-slice-availability';

/**
 * N-002: permission-denied / incomplete KPI slices must not become numeric zeros
 * in org rollup rows or aggregates.
 */
export function isIncompleteKpiAvailability(
  availability: ProjectKpiAvailability | undefined,
): boolean {
  return availability === 'partial' || availability === 'unavailable';
}

/** Return money only when the KPI is complete enough to show a numeric value. */
export function moneyForRollupKpi(
  availability: ProjectKpiAvailability | undefined,
  value: MoneyValue | null | undefined,
): MoneyValue | null {
  if (isIncompleteKpiAvailability(availability)) return null;
  return value ?? null;
}

export interface OrgRollupKpiMoneyFields {
  readonly invoiced: MoneyValue | null;
  readonly paid: MoneyValue | null;
  readonly outstanding: MoneyValue | null;
  readonly actualCost: MoneyValue | null;
  readonly laborActual: MoneyValue | null;
  readonly vendorActual: MoneyValue | null;
  readonly overheadActual: MoneyValue | null;
  readonly committedOpen: MoneyValue | null;
  readonly openApPayable: MoneyValue | null;
  readonly expectedRemainingCost: MoneyValue | null;
  readonly estimatedFinalCost: MoneyValue | null;
  readonly assetCapitalActual: MoneyValue | null;
  readonly estimatedProfit: MoneyValue | null;
  readonly marginPercent: string | null;
  readonly actualProfit: MoneyValue | null;
  readonly actualMarginPercent: string | null;
}

/**
 * Map composed project financials → rollup money fields, withholding incomplete KPIs.
 */
export function resolveOrgRollupKpiMoneyFields(input: {
  readonly kpiAvailability: ProjectFinancialKpiAvailability | undefined;
  readonly canBilling: boolean;
  readonly canProfit: boolean;
  readonly priceNotSet: boolean;
  readonly invoiced: MoneyValue | null;
  readonly paid: MoneyValue | null;
  readonly outstanding: MoneyValue | null;
  readonly actualCost: MoneyValue | null;
  readonly laborActual: MoneyValue | null;
  readonly vendorActual: MoneyValue | null;
  readonly overheadActual: MoneyValue | null;
  readonly committedOpen: MoneyValue | null;
  readonly openApPayable: MoneyValue | null;
  readonly expectedRemainingCost: MoneyValue | null;
  readonly estimatedFinalCost: MoneyValue | null;
  readonly assetCapitalActual: MoneyValue | null;
  readonly estimatedProfit: MoneyValue | null;
  readonly marginPercent: string | null;
  readonly actualProfit: MoneyValue | null;
  readonly actualMarginPercent: string | null;
}): OrgRollupKpiMoneyFields {
  const kpi = input.kpiAvailability;
  const actualIncomplete = isIncompleteKpiAvailability(kpi?.actualCost);
  const forecastIncomplete = isIncompleteKpiAvailability(kpi?.forecastCost);
  const billingUnavailable = !input.canBilling || kpi?.billing === 'unavailable';
  const profitAllowed = input.canProfit && !input.priceNotSet;

  return {
    invoiced: billingUnavailable ? null : input.invoiced,
    paid: billingUnavailable ? null : input.paid,
    outstanding: billingUnavailable ? null : input.outstanding,
    actualCost: moneyForRollupKpi(kpi?.actualCost, input.actualCost),
    laborActual: actualIncomplete ? null : input.laborActual,
    vendorActual: actualIncomplete ? null : input.vendorActual,
    overheadActual: actualIncomplete ? null : input.overheadActual,
    assetCapitalActual: actualIncomplete ? null : input.assetCapitalActual,
    committedOpen: moneyForRollupKpi(kpi?.committed, input.committedOpen),
    openApPayable: moneyForRollupKpi(kpi?.openAp, input.openApPayable),
    expectedRemainingCost: moneyForRollupKpi(kpi?.forecastCost, input.expectedRemainingCost),
    // EFC depends on Actual + remaining commitments + ETC — withhold when either side is incomplete.
    estimatedFinalCost:
      actualIncomplete || forecastIncomplete ? null : input.estimatedFinalCost,
    estimatedProfit: !profitAllowed
      ? null
      : moneyForRollupKpi(kpi?.forecastProfit, input.estimatedProfit),
    marginPercent:
      !profitAllowed || isIncompleteKpiAvailability(kpi?.forecastProfit)
        ? null
        : input.marginPercent,
    actualProfit: !profitAllowed
      ? null
      : moneyForRollupKpi(kpi?.actualProfit, input.actualProfit),
    actualMarginPercent:
      !profitAllowed || isIncompleteKpiAvailability(kpi?.actualProfit)
        ? null
        : input.actualMarginPercent,
  };
}
