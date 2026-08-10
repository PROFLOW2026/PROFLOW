import { MetricDrilldown } from './metric-drilldown';
import {
  resolveProjectKpiDisplay,
  type ProjectFinancialsWithOptionalKpis,
} from './resolve-kpi-display';
import { negateMoney } from '@/shared/money';

export interface ProjectFinancialsKpiPanelProps {
  readonly projectId: string;
  readonly financials: ProjectFinancialsWithOptionalKpis;
  readonly canReadProfit: boolean;
  readonly canReadBilling: boolean;
  readonly canReadCommercial: boolean;
  readonly t: (key: string, values?: Record<string, string | number | Date>) => string;
}

/**
 * Primary project financial KPIs with practical drill-downs and filtered-list links.
 */
export function ProjectFinancialsKpiPanel({
  projectId,
  financials,
  canReadProfit,
  canReadBilling,
  canReadCommercial,
  t,
}: ProjectFinancialsKpiPanelProps) {
  const kpis = resolveProjectKpiDisplay(financials);
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

  return (
    <div className="flex flex-col gap-3 text-sm">
      {canReadCommercial && financials.commercial && kpis.currentContract ? (
        <MetricDrilldown
          label={t('kpis.currentContract')}
          value={kpis.currentContract}
          nature={t('metricNature.commercial')}
          explanation={t('kpis.currentContractHint')}
          emphasis
          lines={[
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
          ]}
          links={[{ href: changesTab, label: t('drillLinks.viewChanges') }]}
        />
      ) : null}

      <MetricDrilldown
        label={t('kpis.actualCost')}
        value={kpis.actualCost}
        nature={t('metricNature.actual')}
        explanation={t('kpis.actualCostHint')}
        emphasis
        lines={[
          {
            label: t('costFamilies.direct_project'),
            value: financials.cost.byFamily.directProject,
          },
          {
            label: t('laborActual'),
            value: financials.cost.laborActual,
          },
          {
            label: t('vendorActual'),
            value: financials.cost.vendorActual,
          },
          {
            label: t('kpis.allocatedOverhead'),
            value: kpis.allocatedOverhead,
          },
          {
            label: t('costFamilies.shared'),
            value: financials.cost.byFamily.shared,
          },
          {
            label: t('costFamilies.asset_capital'),
            value: financials.cost.byFamily.assetCapital,
          },
        ]}
        links={[
          { href: expensesHref, label: t('drillLinks.viewFinalizedExpenses') },
          { href: projectExpensesTab, label: t('drillLinks.projectExpensesTab') },
        ]}
      />

      <MetricDrilldown
        label={t('kpis.allocatedOverhead')}
        value={kpis.allocatedOverhead}
        nature={t('metricNature.actual')}
        explanation={t('kpis.allocatedOverheadHint')}
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
          { href: apHref, label: t('drillLinks.viewVendorBills') },
        ]}
      />

      <MetricDrilldown
        label={t('kpis.forecast')}
        value={kpis.forecastCost}
        nature={t('metricNature.forecast')}
        explanation={
          kpis.forecastEqualsActual
            ? t('kpis.forecastEqualsActualHint')
            : t('kpis.forecastHint')
        }
        lines={[
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
        ]}
        links={[{ href: expensesAllHref, label: t('drillLinks.viewProjectExpenses') }]}
      />

      {canReadBilling ? (
        <>
          <MetricDrilldown
            label={t('kpis.billed')}
            value={kpis.billed}
            nature={t('metricNature.actual')}
            explanation={t('kpis.billedHint')}
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
            links={[
              { href: projectBillingTab, label: t('drillLinks.projectBillingTab') },
              { href: billingPaidHref, label: t('drillLinks.viewPaidBilling') },
            ]}
          />
          <MetricDrilldown
            label={t('kpis.outstanding')}
            value={kpis.outstanding}
            nature={t('metricNature.forecast')}
            explanation={t('kpis.outstandingHint')}
            links={[
              { href: projectBillingTab, label: t('drillLinks.projectBillingTab') },
              { href: billingOutstandingHref, label: t('drillLinks.viewOutstandingBilling') },
            ]}
          />
        </>
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
          explanation={t('kpis.actualMarginHint')}
          emphasis
          lines={[
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
          ]}
        />
      ) : null}

      {canReadProfit && !kpis.priceNotSet && kpis.forecastMargin ? (
        <MetricDrilldown
          label={t('kpis.forecastMargin')}
          value={kpis.forecastMargin}
          nature={t('metricNature.forecast')}
          explanation={
            kpis.forecastEqualsActual
              ? t('kpis.forecastMarginEqualsActualHint')
              : t('kpis.forecastMarginHint')
          }
          lines={[
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
          ]}
        />
      ) : null}
    </div>
  );
}
