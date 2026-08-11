import type { ExplainableMetricKey, ExplanationSourceKind } from '../domain/metric-explainability';

/**
 * Maps explanation source kinds to in-app routes for "Why this number?" links.
 * Paths stay relative to the locale-aware Link base.
 */
export function resolveExplanationSourceHref(
  kind: ExplanationSourceKind,
  projectId: string,
): string {
  switch (kind) {
    case 'expenses_finalized':
      return `/expenses?projectId=${encodeURIComponent(projectId)}&status=finalized`;
    case 'expenses_all':
      return `/expenses?projectId=${encodeURIComponent(projectId)}`;
    case 'project_expenses_tab':
      return `/projects/${projectId}?tab=expenses`;
    case 'project_changes_tab':
      return `/projects/${projectId}?tab=changes`;
    case 'project_billing_tab':
      return `/projects/${projectId}?tab=billing`;
    case 'billing_outstanding':
      return '/billing?filter=outstanding';
    case 'procurement_po':
      return '/procurement';
    case 'procurement_ap':
      return '/procurement/ap';
    case 'expenses_overhead':
      return `/expenses?projectId=${encodeURIComponent(projectId)}&costFamily=business_overhead&status=finalized`;
    case 'org_expenses':
      return '/expenses?status=finalized';
    default:
      return `/projects/${projectId}`;
  }
}

export function metricKeyToKpiExplainKey(
  metric: ExplainableMetricKey,
): string {
  switch (metric) {
    case 'actual':
      return 'actualCost';
    case 'forecast':
      return 'forecast';
    case 'current_contract':
      return 'currentContract';
    case 'actual_margin':
      return 'actualMargin';
    case 'forecast_margin':
      return 'forecastMargin';
    case 'outstanding_ar':
      return 'outstanding';
    case 'outstanding_ap':
      return 'openAp';
    case 'unallocated_cost':
      return 'unallocated';
    default:
      return metric;
  }
}
