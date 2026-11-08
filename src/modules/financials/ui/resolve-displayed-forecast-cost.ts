import {
  DEFAULT_PROJECT_PROFITABILITY_MODE,
  type ProjectProfitabilityMode,
} from '@/modules/tenancy/domain/project-profitability-mode';
import type { MoneyValue } from '@/shared/money';
import type { CostPosition } from '../domain/types';
import { resolveForecastCostBasis } from '../domain/resolve-forecast-cost-basis';

/**
 * Forecast figure for the older project financials board.
 * Same selection composeProjectFinancials uses for the org profitability mode.
 */
export function resolveDisplayedForecastFinalCost(
  mode: ProjectProfitabilityMode | null | undefined,
  cost: CostPosition,
): MoneyValue {
  return resolveForecastCostBasis(
    mode ?? DEFAULT_PROJECT_PROFITABILITY_MODE,
    cost,
  ).primaryForecastFinalCost;
}
