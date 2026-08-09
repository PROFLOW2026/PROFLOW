/** Public API of the financials module (docs 04, 46, 51). */
export { getProjectFinancials } from './application/get-project-financials';
export { getOrganizationFinancials } from './application/get-organization-financials';
export { getHomeDashboard } from './application/get-home-dashboard';
export type { HomeDashboardData, DashboardAttention } from './application/get-home-dashboard';

export { computeProfitPosition, computeMarginPercent } from './domain/profit';
export { buildFinancialCoverage, ALL_COST_SOURCES } from './domain/coverage';
export { aggregateProjectCosts, emptyCostPosition } from './domain/cost-aggregation';
export type { ProjectExpenseContribution, LaborCostContribution } from './domain/cost-aggregation';

export type {
  ProjectFinancials,
  OrganizationFinancials,
  FinancialCoverage,
  CommercialPosition,
  BillingPosition,
  CostPosition,
  ProfitPosition,
  CostSourceKey,
  CalculationBasis,
} from './domain/types';
export { isCovered } from './domain/types';
