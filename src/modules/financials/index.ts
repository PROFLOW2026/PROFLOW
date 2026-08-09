/** Public API of the financials module (docs 04, 46, 51). */
export { getProjectFinancials } from './application/get-project-financials';
export { getOrganizationFinancials } from './application/get-organization-financials';
export { getOrganizationProjectRollup } from './application/get-organization-project-rollup';
export type {
  OrganizationProjectRollup,
  OrganizationOpsSummary,
  ProjectRollupRow,
} from './application/get-organization-project-rollup';
export { getOrganizationReportsAnalytics } from './application/get-organization-reports-analytics';
export type {
  OrganizationReportsAnalytics,
  OperationsReportSection,
} from './application/get-organization-reports-analytics';
export {
  aggregateOrgCommercial,
  aggregateOrgCash,
  aggregateOrgCost,
  aggregateOrgProfit,
} from './domain/aggregate-org-report';
export { moneyMetric, sumMoneyMetrics } from './domain/report-metric';
export type { MoneyReportMetric, CountReportMetric, ReportMetricKind } from './domain/report-metric';
export { getOrganizationCashFlowOutlook } from './application/get-organization-cash-flow';
export { getProjectCashFlowOutlook } from './application/get-project-cash-flow';
export type {
  CashFlowOutlook,
  CashFlowBucket,
  CashFlowActualCollected,
  CashFlowOutgoingCoverage,
} from './domain/cash-flow';
export {
  computeIncomingCashOutlook,
  computeCollectedActual,
  computeOutgoingCashOutlook,
  buildCashFlowOutlook,
} from './domain/cash-flow';
export { getHomeDashboard } from './application/get-home-dashboard';
export type { HomeDashboardData, DashboardAttention } from './application/get-home-dashboard';

export { computeProfitPosition, computeMarginPercent } from './domain/profit';
export { buildFinancialCoverage, ALL_COST_SOURCES } from './domain/coverage';
export { aggregateProjectCosts, emptyCostPosition, withCommittedAndApPayable } from './domain/cost-aggregation';
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
  MetricNature,
} from './domain/types';
export { isCovered } from './domain/types';
