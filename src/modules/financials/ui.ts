/**
 * UI entry point for this module.
 *
 * Kept separate from `index.ts` so importing the module's application or domain
 * layer never pulls React server components — and the `server-only` guard they
 * import — into plain Node contexts such as unit tests.
 */

export { ProjectFinancialsPanel, ProjectFinancialsSnapshot } from './ui/project-financials-panel';
export { HomeDashboardContent } from './ui/home-dashboard-content';
export { CashFlowView } from './ui/cash-flow-view';
export type { CashFlowViewCopy } from './ui/cash-flow-view';
export { ReportsAnalyticsView } from './ui/reports-analytics-view';
export { MoneyReportMetricTile, CountReportMetricTile } from './ui/report-metric-tile';
export { MetricDrilldown } from './ui/metric-drilldown';
export { ProjectFinancialsKpiPanel } from './ui/project-financials-kpi-panel';
export { resolveProjectKpiDisplay } from './ui/resolve-kpi-display';
