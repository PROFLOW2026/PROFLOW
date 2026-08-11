import { MetricDrilldown } from './metric-drilldown';
import { DataConfidenceBadge } from './data-confidence-badge';
import { resolveExplanationSourceHref } from './explainability-links';
import {
  resolveProjectKpiDisplay,
  type ProjectFinancialsWithOptionalKpis,
} from './resolve-kpi-display';
import {
  buildProjectFinancialExplainability,
  findMetricExplanation,
  type ExplanationCategoryKey,
  type ExplainableMetricKey,
} from '../domain/metric-explainability';
import type { DataConfidenceLevel, DataConfidenceReason } from '../domain/data-confidence';
import { negateMoney } from '@/shared/money';

export interface ProjectFinancialsKpiPanelProps {
  readonly projectId: string;
  readonly financials: ProjectFinancialsWithOptionalKpis;
  readonly canReadProfit: boolean;
  readonly canReadBilling: boolean;
  readonly canReadCommercial: boolean;
  readonly canReadAp?: boolean;
  readonly t: (key: string, values?: Record<string, string | number | Date>) => string;
}

function categoryLabel(
  t: ProjectFinancialsKpiPanelProps['t'],
  key: ExplanationCategoryKey,
): string {
  switch (key) {
    case 'direct_project':
      return t('costFamilies.direct_project');
    case 'shared':
      return t('costFamilies.shared');
    case 'business_overhead':
      return t('costFamilies.business_overhead');
    case 'asset_capital':
      return t('costFamilies.asset_capital');
    case 'recognized_original':
      return t('kpis.recognizedOriginal');
    case 'month_close_cost':
      return t('kpis.monthCloseCost');
    case 'month_close_revenue':
      return t('kpis.monthCloseRevenue');
    case 'labor_actual':
      return t('laborActual');
    case 'vendor_actual':
      return t('vendorActual');
    case 'overhead_actual':
      return t('overheadActual');
    case 'committed_open':
      return t('committedOpen');
    case 'expected_remaining':
      return t('kpis.expectedRemaining');
    case 'original_contract':
      return t('originalContractValue');
    case 'approved_additions':
      return t('approvedAdditions');
    case 'approved_reductions':
      return t('approvedReductions');
    case 'pending_changes':
      return t('pendingChanges');
    case 'current_contract':
      return t('kpis.currentContract');
    case 'actual_cost':
      return t('kpis.actualCost');
    case 'forecast_cost':
      return t('kpis.forecast');
    case 'invoiced':
      return t('kpis.billed');
    case 'paid':
      return t('kpis.paid');
    case 'retention_held':
      return t('kpis.retentionHeld');
    case 'open_ap_payable':
      return t('openApPayable');
    case 'unallocated_business':
      return t('unallocatedBusinessCosts');
    case 'actual_margin':
      return t('kpis.actualMargin');
    case 'forecast_margin':
      return t('kpis.forecastMargin');
    case 'outstanding_ar':
      return t('kpis.outstanding');
    default:
      return key;
  }
}

function sourceLinkLabel(
  t: ProjectFinancialsKpiPanelProps['t'],
  kind: string,
): string {
  switch (kind) {
    case 'expenses_finalized':
      return t('drillLinks.viewFinalizedExpenses');
    case 'expenses_all':
      return t('drillLinks.viewProjectExpenses');
    case 'project_expenses_tab':
      return t('drillLinks.projectExpensesTab');
    case 'project_changes_tab':
      return t('drillLinks.viewChanges');
    case 'project_billing_tab':
      return t('drillLinks.projectBillingTab');
    case 'billing_outstanding':
      return t('drillLinks.viewOutstandingBilling');
    case 'procurement_po':
      return t('drillLinks.viewPurchaseOrders');
    case 'procurement_ap':
      return t('drillLinks.viewVendorBills');
    case 'expenses_overhead':
      return t('drillLinks.viewOverheadOnProject');
    case 'org_expenses':
      return t('drillLinks.viewAllExpenses');
    case 'month_close':
      return t('drillLinks.viewMonthClose');
    default:
      return t('drillLinks.viewAllExpenses');
  }
}

function confidenceLabel(
  t: ProjectFinancialsKpiPanelProps['t'],
  level: DataConfidenceLevel,
): string {
  return t(`confidence.levels.${level}`);
}

function confidenceTitle(
  t: ProjectFinancialsKpiPanelProps['t'],
  reasons: readonly string[],
): string {
  if (reasons.length === 0) return t('confidence.highHint');
  return reasons
    .map((reason) => t(`confidence.reasons.${reason as DataConfidenceReason}`))
    .join(' · ');
}

function drillFromMetric(
  projectId: string,
  metric: ExplainableMetricKey,
  financials: ProjectFinancialsWithOptionalKpis,
  t: ProjectFinancialsKpiPanelProps['t'],
  canReadAp: boolean,
) {
  const confidence =
    financials.dataConfidence ??
    ({ level: 'high' as const, reasons: [] as const });

  const explainability = buildProjectFinancialExplainability({
    financials,
    dataConfidence: {
      level: confidence.level as DataConfidenceLevel,
      reasons: confidence.reasons as DataConfidenceReason[],
    },
    canReadCommercial: Boolean(financials.commercial),
    canReadBilling: true,
    canReadProfit: Boolean(financials.profit),
    canReadAp,
  });

  const explanation = findMetricExplanation(explainability, metric);
  if (!explanation) return null;

  const lines = explanation.categories.map((line) => ({
      label: categoryLabel(t, line.key),
      value:
        line.role === 'subtract'
          ? negateMoney(line.amount)
          : line.amount,
      muted: line.role === 'info',
      emphasis: line.role === 'total',
      hint:
        line.role === 'info'
          ? t('explain.infoLineHint')
          : undefined,
    }));

  const links = explanation.sources.map((source) => ({
    href: resolveExplanationSourceHref(source.kind, projectId),
    label: sourceLinkLabel(t, source.kind),
  }));

  return {
    explanation: t(`explain.formulas.${explanation.formulaKey}`),
    lines,
    links,
    whyLabel: t('explain.whyThisNumber'),
  };
}

/**
 * Primary project financial KPIs with practical drill-downs and filtered-list links.
 * "Why this number?" packs reuse the composed engine — no second Actual formula.
 */
export function ProjectFinancialsKpiPanel({
  projectId,
  financials,
  canReadProfit,
  canReadBilling,
  canReadCommercial,
  canReadAp = true,
  t,
}: ProjectFinancialsKpiPanelProps) {
  const kpis = resolveProjectKpiDisplay(financials);
  const confidence = financials.dataConfidence ?? { level: 'high' as const, reasons: [] };
  const expensesHref = `/expenses?projectId=${encodeURIComponent(projectId)}&status=finalized`;
  const expensesAllHref = `/expenses?projectId=${encodeURIComponent(projectId)}`;
  const projectExpensesTab = `/projects/${projectId}?tab=expenses`;
  const projectBillingTab = `/projects/${projectId}?tab=billing`;
  const procurementHref = '/procurement';
  const apHref = '/procurement/ap';
  const billingOutstandingHref = '/billing?filter=outstanding';
  const billingPaidHref = '/billing?filter=paid';
  const billingAllHref = '/billing?filter=all';
  const changesTab = `/projects/${projectId}?tab=changes`;

  const actualDrill = drillFromMetric(projectId, 'actual', financials, t, canReadAp);
  const forecastDrill = drillFromMetric(projectId, 'forecast', financials, t, canReadAp);
  const contractDrill = drillFromMetric(
    projectId,
    'current_contract',
    financials,
    t,
    canReadAp,
  );
  const actualMarginDrill = drillFromMetric(
    projectId,
    'actual_margin',
    financials,
    t,
    canReadAp,
  );
  const forecastMarginDrill = drillFromMetric(
    projectId,
    'forecast_margin',
    financials,
    t,
    canReadAp,
  );
  const outstandingArDrill = drillFromMetric(
    projectId,
    'outstanding_ar',
    financials,
    t,
    canReadAp,
  );
  const outstandingApDrill = canReadAp
    ? drillFromMetric(projectId, 'outstanding_ap', financials, t, canReadAp)
    : null;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--pf-text-muted)]">{t('confidence.title')}</p>
        <DataConfidenceBadge
          level={confidence.level as DataConfidenceLevel}
          label={confidenceLabel(t, confidence.level as DataConfidenceLevel)}
          title={confidenceTitle(t, confidence.reasons)}
        />
      </div>

      {canReadCommercial && financials.commercial && kpis.currentContract ? (
        <MetricDrilldown
          label={t('kpis.currentContract')}
          value={kpis.currentContract}
          nature={t('metricNature.commercial')}
          explanation={contractDrill?.explanation ?? t('kpis.currentContractHint')}
          whyLabel={contractDrill?.whyLabel}
          emphasis
          lines={
            contractDrill?.lines ?? [
              {
                label: t('originalContractValue'),
                value: financials.commercial.originalContractValue,
              },
              {
                label: t('approvedAdditions'),
                value: financials.commercial.approvedAdditions,
              },
              {
                label: t('approvedReductions'),
                value: negateMoney(financials.commercial.approvedReductions),
                muted: true,
              },
              {
                label: t('pendingChanges'),
                value: financials.commercial.pendingChanges,
                hint: t('kpis.pendingNotInContract'),
                muted: true,
              },
            ]
          }
          links={
            contractDrill?.links ?? [{ href: changesTab, label: t('drillLinks.viewChanges') }]
          }
        />
      ) : null}

      <MetricDrilldown
        label={t('kpis.actualCost')}
        value={kpis.actualCost}
        nature={t('metricNature.actual')}
        explanation={actualDrill?.explanation ?? t('kpis.actualCostHint')}
        whyLabel={actualDrill?.whyLabel}
        emphasis
        lines={
          actualDrill?.lines ?? [
            {
              label: t('kpis.recognizedOriginal'),
              value: financials.cost.actualCostToDate,
            },
            {
              label: t('kpis.monthCloseCost'),
              value: financials.cost.monthCloseCostNet,
              muted: true,
              hint: t('explain.infoLineHint'),
            },
            {
              label: t('kpis.actualCost'),
              value: financials.cost.actualCostToDate,
              emphasis: true,
            },
          ]
        }
        links={
          actualDrill?.links ?? [
            { href: expensesHref, label: t('drillLinks.viewFinalizedExpenses') },
            { href: projectExpensesTab, label: t('drillLinks.projectExpensesTab') },
          ]
        }
      />

      <MetricDrilldown
        label={t('kpis.allocatedOverhead')}
        value={kpis.allocatedOverhead}
        nature={t('metricNature.actual')}
        explanation={t('kpis.allocatedOverheadHint')}
        whyLabel={t('explain.whyThisNumber')}
        lines={[
          {
            label: t('costFamilies.business_overhead'),
            value: financials.cost.byFamily.businessOverhead,
          },
          {
            label: t('coverage.allocatedOverhead'),
            value: kpis.allocatedOverhead,
            hint: t('kpis.allocatedOverheadSourceHint'),
          },
        ]}
        links={[
          {
            href: `/expenses?projectId=${encodeURIComponent(projectId)}&costFamily=business_overhead&status=finalized`,
            label: t('drillLinks.viewOverheadOnProject'),
          },
          { href: '/expenses?status=finalized', label: t('drillLinks.viewAllExpenses') },
        ]}
      />

      <MetricDrilldown
        label={t('kpis.committed')}
        value={kpis.committed}
        nature={t('metricNature.committed')}
        explanation={t('kpis.committedHint')}
        whyLabel={t('explain.whyThisNumber')}
        lines={[
          {
            label: t('committedOpen'),
            value: financials.cost.committedOpen,
          },
          {
            label: t('openApPayable'),
            value: financials.cost.openApPayable,
            hint: t('openApPayableHint'),
            muted: true,
          },
        ]}
        links={[
          { href: procurementHref, label: t('drillLinks.viewPurchaseOrders') },
          ...(canReadAp
            ? [{ href: apHref, label: t('drillLinks.viewVendorBills') }]
            : []),
        ]}
      />

      <MetricDrilldown
        label={t('kpis.forecast')}
        value={kpis.forecastCost}
        nature={t('metricNature.forecast')}
        explanation={
          forecastDrill?.explanation ??
          (kpis.forecastEqualsActual
            ? t('kpis.forecastEqualsActualHint')
            : t('kpis.forecastHint'))
        }
        whyLabel={forecastDrill?.whyLabel}
        lines={
          forecastDrill?.lines ?? [
            {
              label: t('kpis.actualCost'),
              value: kpis.actualCost,
            },
            {
              label: t('kpis.committed'),
              value: kpis.committed,
              hint: t('kpis.committedInForecastHint'),
            },
            {
              label: t('kpis.expectedRemaining'),
              value: kpis.expectedRemainingCost,
              hint: t('kpis.expectedRemainingHint'),
            },
            {
              label: t('estimatedFinalCost'),
              value: financials.cost.estimatedFinalCost,
              hint: t('estimatedFinalCostHint'),
              emphasis: true,
            },
          ]
        }
        links={
          forecastDrill?.links ?? [
            { href: expensesAllHref, label: t('drillLinks.viewProjectExpenses') },
          ]
        }
      />

      {canReadBilling ? (
        <>
          <MetricDrilldown
            label={t('kpis.billed')}
            value={kpis.billed}
            nature={t('metricNature.actual')}
            explanation={t('kpis.billedHint')}
            whyLabel={t('explain.whyThisNumber')}
            links={[
              { href: projectBillingTab, label: t('drillLinks.projectBillingTab') },
              { href: billingAllHref, label: t('drillLinks.viewBilling') },
            ]}
          />
          <MetricDrilldown
            label={t('kpis.paid')}
            value={kpis.paid}
            nature={t('metricNature.actual')}
            explanation={t('kpis.paidHint')}
            whyLabel={t('explain.whyThisNumber')}
            links={[
              { href: projectBillingTab, label: t('drillLinks.projectBillingTab') },
              { href: billingPaidHref, label: t('drillLinks.viewPaidBilling') },
            ]}
          />
          <MetricDrilldown
            label={t('kpis.outstanding')}
            value={kpis.outstanding}
            nature={t('metricNature.forecast')}
            explanation={
              outstandingArDrill?.explanation ?? t('kpis.outstandingHint')
            }
            whyLabel={outstandingArDrill?.whyLabel}
            lines={outstandingArDrill?.lines}
            links={
              outstandingArDrill?.links ?? [
                { href: projectBillingTab, label: t('drillLinks.projectBillingTab') },
                {
                  href: billingOutstandingHref,
                  label: t('drillLinks.viewOutstandingBilling'),
                },
              ]
            }
          />
        </>
      ) : null}

      {canReadAp && outstandingApDrill ? (
        <MetricDrilldown
          label={t('openApPayable')}
          value={financials.cost.openApPayable}
          nature={t('metricNature.forecast')}
          explanation={outstandingApDrill.explanation}
          whyLabel={outstandingApDrill.whyLabel}
          lines={outstandingApDrill.lines}
          links={outstandingApDrill.links}
        />
      ) : null}

      {canReadProfit && kpis.priceNotSet ? (
        <div
          className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm"
          data-testid="price-not-set-banner"
        >
          <p className="font-medium">{t('kpis.priceNotSet')}</p>
          <p className="mt-1 text-muted-foreground">{t('kpis.priceNotSetHint')}</p>
        </div>
      ) : null}

      {canReadProfit && !kpis.priceNotSet && kpis.actualMargin ? (
        <MetricDrilldown
          label={t('kpis.actualMargin')}
          value={kpis.actualMargin}
          nature={t('metricNature.actual')}
          explanation={actualMarginDrill?.explanation ?? t('kpis.actualMarginHint')}
          whyLabel={actualMarginDrill?.whyLabel}
          emphasis
          lines={
            actualMarginDrill?.lines ?? [
              ...(kpis.currentContract
                ? [{ label: t('kpis.currentContract'), value: kpis.currentContract }]
                : []),
              {
                label: t('kpis.actualCost'),
                value: kpis.actualCost,
              },
              ...(kpis.actualMarginPercent != null
                ? [
                    {
                      label: t('margin'),
                      hint: `${kpis.actualMarginPercent}%`,
                      muted: true as const,
                    },
                  ]
                : []),
            ]
          }
        />
      ) : null}

      {canReadProfit && !kpis.priceNotSet && kpis.forecastMargin ? (
        <MetricDrilldown
          label={t('kpis.forecastMargin')}
          value={kpis.forecastMargin}
          nature={t('metricNature.forecast')}
          explanation={
            forecastMarginDrill?.explanation ??
            (kpis.forecastEqualsActual
              ? t('kpis.forecastMarginEqualsActualHint')
              : t('kpis.forecastMarginHint'))
          }
          whyLabel={forecastMarginDrill?.whyLabel}
          lines={
            forecastMarginDrill?.lines ?? [
              ...(kpis.currentContract
                ? [{ label: t('kpis.currentContract'), value: kpis.currentContract }]
                : []),
              {
                label: t('kpis.forecast'),
                value: kpis.forecastCost,
              },
              ...(kpis.forecastMarginPercent != null
                ? [
                    {
                      label: t('margin'),
                      hint: `${kpis.forecastMarginPercent}%`,
                      muted: true as const,
                    },
                  ]
                : []),
            ]
          }
        />
      ) : null}
    </div>
  );
}
