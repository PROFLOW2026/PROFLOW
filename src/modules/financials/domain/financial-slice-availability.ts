import { isZeroMoney } from '@/shared/money';
import type { FinancialCoverage, ProjectFinancials } from './types';

/** How a cost/revenue slice was loaded for compose — never confuse with zero Actual. */
export type FinancialSliceLoadState =
  | 'loaded'
  | 'empty'
  | 'permission_denied'
  | 'unavailable';

export interface FinancialSliceAvailability {
  readonly expenses: FinancialSliceLoadState;
  readonly labor: FinancialSliceLoadState;
  readonly procurement: FinancialSliceLoadState;
  readonly ap: FinancialSliceLoadState;
  readonly commercial: FinancialSliceLoadState;
  readonly billing: FinancialSliceLoadState;
}

export type ProjectKpiAvailability = 'value' | 'unavailable' | 'partial';

export interface ProjectFinancialKpiAvailability {
  readonly actualCost: ProjectKpiAvailability;
  readonly forecastCost: ProjectKpiAvailability;
  readonly actualProfit: ProjectKpiAvailability;
  readonly forecastProfit: ProjectKpiAvailability;
  readonly committed: ProjectKpiAvailability;
  readonly openAp: ProjectKpiAvailability;
  readonly billing: ProjectKpiAvailability;
}

export function buildSliceAvailability(input: {
  readonly canReadExpenses: boolean;
  readonly canReadWorkforce: boolean;
  readonly canReadProcurement: boolean;
  readonly canReadAp: boolean;
  readonly canReadCommercial: boolean;
  readonly canReadBilling: boolean;
  readonly laborLoaded?: boolean;
}): FinancialSliceAvailability {
  return {
    expenses: input.canReadExpenses ? 'loaded' : 'permission_denied',
    labor: !input.canReadWorkforce
      ? 'permission_denied'
      : input.laborLoaded
        ? 'loaded'
        : 'empty',
    procurement: input.canReadProcurement ? 'loaded' : 'permission_denied',
    ap: input.canReadAp ? 'loaded' : 'permission_denied',
    commercial: input.canReadCommercial ? 'loaded' : 'permission_denied',
    billing: input.canReadBilling ? 'loaded' : 'permission_denied',
  };
}

function laborMissingCostCount(coverage: FinancialCoverage): number {
  let total = 0;
  for (const partial of coverage.partials ?? []) {
    if (partial.reason === 'workforce_entries_missing_cost') {
      total += partial.count ?? 0;
    }
  }
  return total;
}

/**
 * Resolve which headline KPIs may show numeric values vs unavailable/partial.
 * Permission-denied slices must not render as factual zeros.
 *
 * Residual hours missing a time-entry cost must not hide a recognized Actual
 * that already exists from expenses / AP / monthly labor / materials.
 * Only withhold Actual when there is no recognized amount at all and labor
 * would otherwise be shown as ₪0.
 */
export function resolveProjectFinancialKpiAvailability(
  financials: ProjectFinancials,
): ProjectFinancialKpiAvailability {
  const slices = financials.sliceAvailability;
  const missingLaborCost = laborMissingCostCount(financials.coverage) > 0;
  const laborUnresolvedZero =
    missingLaborCost && isZeroMoney(financials.cost.laborActual);
  const noRecognizedActual = isZeroMoney(
    financials.cost.directActualCostToDate ?? financials.cost.actualCostToDate,
  );

  const expensesDenied = slices.expenses === 'permission_denied';
  const laborDenied = slices.labor === 'permission_denied';
  const apDenied = slices.ap === 'permission_denied';
  const procurementDenied = slices.procurement === 'permission_denied';
  const billingDenied = slices.billing === 'permission_denied';

  const anyCostSliceDenied = expensesDenied || laborDenied || apDenied;

  let actualCost: ProjectKpiAvailability = 'value';
  if (laborUnresolvedZero && noRecognizedActual) {
    actualCost = 'unavailable';
  } else if (anyCostSliceDenied) {
    actualCost = 'partial';
  }

  let forecastCost: ProjectKpiAvailability = 'value';
  if (actualCost === 'unavailable') {
    forecastCost = 'unavailable';
  } else if (anyCostSliceDenied || procurementDenied) {
    forecastCost = 'partial';
  }

  const profitBlocked = financials.priceNotSet || actualCost === 'unavailable';
  const actualProfit: ProjectKpiAvailability = profitBlocked
    ? 'unavailable'
    : anyCostSliceDenied
      ? 'partial'
      : financials.profit
        ? 'value'
        : 'unavailable';

  const forecastProfit: ProjectKpiAvailability = profitBlocked
    ? 'unavailable'
    : forecastCost === 'partial'
      ? 'partial'
      : financials.profit
        ? 'value'
        : 'unavailable';

  return {
    actualCost,
    forecastCost,
    actualProfit,
    forecastProfit,
    committed: procurementDenied ? 'partial' : 'value',
    openAp: apDenied ? 'partial' : 'value',
    billing: billingDenied ? 'unavailable' : 'value',
  };
}
