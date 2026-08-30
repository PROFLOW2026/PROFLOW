import type { ProjectProfitabilityMode } from '@/modules/tenancy/domain/project-profitability-mode';
import type { CostPosition } from './types';
import type { MoneyValue } from '@/shared/money';

export interface ResolvedForecastCostBasis {
  readonly directForecastFinalCost: MoneyValue;
  readonly fullForecastFinalCost: MoneyValue;
  readonly primaryForecastFinalCost: MoneyValue;
}

/** Select Direct vs Full forecast for display/profit based on profitability mode. */
export function resolveForecastCostBasis(
  mode: ProjectProfitabilityMode,
  cost: CostPosition,
): ResolvedForecastCostBasis {
  const directForecastFinalCost = cost.directForecastFinalCost ?? cost.estimatedFinalCost;
  const fullForecastFinalCost = cost.fullForecastFinalCost ?? cost.estimatedFinalCost;
  const primaryForecastFinalCost =
    mode === 'include_general' ? fullForecastFinalCost : directForecastFinalCost;
  return { directForecastFinalCost, fullForecastFinalCost, primaryForecastFinalCost };
}
