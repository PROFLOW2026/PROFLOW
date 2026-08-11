/** Public API of the financials module (docs 04, 46, 51). */
export { getProjectFinancials } from './application/get-project-financials';
export { setProjectExpectedRemainingCost } from './application/set-project-expected-remaining-cost';
export { getOrganizationFinancials } from './application/get-organization-financials';
export { getOrganizationProjectRollup } from './application/get-organization-project-rollup';
export type {
  OrganizationProjectRollup,
  OrganizationProjectRollupOptions,
  OrganizationOpsSummary,
  ProjectRollupRow,
} from './application/get-organization-project-rollup';
export { getOrganizationReportsAnalytics } from './application/get-organization-reports-analytics';
export type {
  OrganizationReportsAnalytics,
  OrganizationReportsAnalyticsOptions,
  OperationsReportSection,
} from './application/get-organization-reports-analytics';
export {
  isOpenPriceJob,
  hasRevenueBasisForProfitability,
  isEligibleForContractWeightAllocation,
  matchesWorkKindFilter,
  parseWorkKindFilter,
  normalizeWorkKind,
  normalizePricingMode,
} from './domain/work-pricing';
export type { WorkKind, PricingMode, WorkKindFilter } from './domain/work-pricing';
export { filterRowsByWorkKind, partitionWorkKindCounts } from './domain/work-kind-filter';
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
export type {
  HomeDashboardData,
  HomeDashboardOptions,
  DashboardAttention,
  OrganizationForecastSummary,
} from './application/get-home-dashboard';

export { attachEntryBaselineContext } from './domain/entry-baseline-context';
export { computeProfitPosition, computeMarginPercent } from './domain/profit';
export { buildFinancialCoverage, ALL_COST_SOURCES } from './domain/coverage';
export {
  resolveDataConfidence,
  collectDataConfidenceSignals,
  dataConfidenceFromCoverage,
  mergeDataConfidence,
} from './domain/data-confidence';
export type {
  DataConfidence,
  DataConfidenceLevel,
  DataConfidenceReason,
  DataConfidenceSignals,
} from './domain/data-confidence';
export {
  buildProjectFinancialExplainability,
  findMetricExplanation,
} from './domain/metric-explainability';
export type {
  ExplainableMetricKey,
  MetricExplanation,
  ProjectFinancialExplainability,
} from './domain/metric-explainability';
export {
  aggregateProjectCosts,
  emptyCostPosition,
  withCommittedAndApPayable,
  withRecognizedVendorBills,
  computeForecastFinalCost,
} from './domain/cost-aggregation';
export type {
  ProjectExpenseContribution,
  LaborCostContribution,
  ForecastFinalCostInput,
} from './domain/cost-aggregation';
export {
  sumProjectTouchingExpenseNets,
  computeUnallocatedOrganizationCosts,
  expenseTotalsReconcile,
} from './domain/org-cost-reconciliation';

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
