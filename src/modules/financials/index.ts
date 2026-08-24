/** Public API of the financials module (docs 04, 46, 51). */
export { getProjectFinancials } from './application/get-project-financials';
export { composeProjectFinancials } from './application/compose-project-financials';
export { loadProjectCommercialData, loadContractCommercialData } from './data/commercial.repository';
export type { ContractCommercialSlice, ProjectCommercialData } from './data/commercial.repository';
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
export { parseReportsSection, reportsHref } from './domain/reports-section';
export type { ReportsSection } from './domain/reports-section';
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
export { getOrganizationCashFlowForecast } from './application/get-organization-cash-flow-forecast';
export { getProjectCashFlowOutlook } from './application/get-project-cash-flow';
export type {
  CashFlowOutlook,
  CashFlowBucket,
  CashFlowActualCollected,
  CashFlowOutgoingCoverage,
  CashFlowBucketKey,
} from './domain/cash-flow';
export type {
  CashFlowForecast,
  CashFlowForecastItem,
  CashFlowCertainty,
  CashFlowSourceType,
} from './domain/cash-flow-forecast';
export type { ManagementAnalytics } from './domain/management-analytics';
export {
  computeIncomingCashOutlook,
  computeCollectedActual,
  computeOutgoingCashOutlook,
  buildCashFlowOutlook,
  assignCashFlowBucket,
  CASH_FLOW_BUCKET_KEYS,
} from './domain/cash-flow';
export {
  buildCashFlowForecast,
  certaintyForDatedSource,
} from './domain/cash-flow-forecast';
export {
  computeUnbilledBacklog,
  computeQuotesConversion,
  computeOpportunityConversion,
  computeVendorConcentration,
  emptyManagementAnalytics,
} from './domain/management-analytics';
export { getHomeDashboard } from './application/get-home-dashboard';
export type {
  HomeDashboardData,
  HomeDashboardOptions,
  DashboardAttention,
  OrganizationForecastSummary,
} from './application/get-home-dashboard';

export { attachEntryBaselineContext } from './domain/entry-baseline-context';
export { sumCommercialPositions, addCommercialPositions } from './domain/aggregate-commercial';
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
export { loadProjectExpenseContributions } from './data/expenses.repository';
export { loadProjectCommercialBundle } from './data/commercial.repository';
export { loadProjectBillingRows } from './data/billing.repository';
export type { ProjectBillingRows } from './data/billing.repository';
export { loadMonthCloseEconomicForProject } from './data/month-close-economic.repository';
export { loadRecognizedVendorBillsForProject } from './data/committed-costs.repository';
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
export {
  listExpenseOverlapCandidates,
  listApBillOverlapCandidates,
} from './data/expense-ap-overlap.repository';
export type {
  ExpenseOverlapCandidate,
  ApBillOverlapCandidate,
} from './domain/expense-ap-overlap';
export { loadRecognizedActualForSubcontractAgreement } from './data/subcontract-commitment.repository';
export {
  getCachedProjectActualBreakdown,
  getProjectActualBreakdown,
  getProjectLaborByEmployeeAggregate,
} from './application/get-project-actual-breakdown';
export type { ProjectActualBreakdownResult } from './application/get-project-actual-breakdown';
export type {
  ProjectActualBreakdown,
  ProjectActualBreakdownCategoryKey,
} from './domain/project-actual-breakdown';

