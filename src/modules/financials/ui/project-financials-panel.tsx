import { getTranslations } from 'next-intl/server';
import { CoverageDisclosure } from '@/components/patterns/coverage-disclosure';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { pressableClassName } from '@/components/ui/pressable';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/shared/ui/cn';
import { withOrgContext } from '@/shared/auth/session';
import { negateMoney } from '@/shared/money';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getProjectCashFlowOutlook } from '../application/get-project-cash-flow';
import { loadCachedProjectFinancials } from './load-cached-project-financials';
import { CashFlowView } from './cash-flow-view';
import { mapCoverageToSources, standalonePartialNotes } from './map-coverage-sources';
import { ProjectFinancialsKpiPanel } from './project-financials-kpi-panel';
import { ExpectedRemainingCostForm } from './expected-remaining-cost-form';

export interface ProjectFinancialsPanelProps {
  readonly projectId: string;
}

/**
 * Embeddable server component for a project workspace Financials tab (doc 45 §5).
 * Primary truth metrics stay above the fold with drill-downs; coverage sits in disclosure.
 */
export async function ProjectFinancialsPanel({ projectId }: ProjectFinancialsPanelProps) {
  const t = await getTranslations('financial');

  const [financials, extras] = await Promise.all([
    loadCachedProjectFinancials(projectId),
    withOrgContext(async (context) => {
      const cashFlowResult = await getProjectCashFlowOutlook(context, projectId);
      return {
        cashFlow: cashFlowResult,
        canReadProfit: hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ),
        canReadBilling: hasPermission(context, PERMISSIONS.BILLING_READ),
        canReadCommercial: hasPermission(context, PERMISSIONS.CONTRACTS_READ),
        canUpdateProject: hasPermission(context, PERMISSIONS.PROJECTS_UPDATE),
        canReadAp: hasPermission(context, PERMISSIONS.AP_READ),
      };
    }),
  ]);
  const { cashFlow, canReadProfit, canReadBilling, canReadCommercial, canUpdateProject, canReadAp } =
    extras;

  const coverageSources = mapCoverageToSources(financials.coverage, t);
  const hasCostPartials = (financials.coverage.partials?.length ?? 0) > 0;
  const billingNotes = standalonePartialNotes(financials.coverage, t, [
    'foreign_currency_billing_excluded',
  ]);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('panelTitle')}</CardTitle>
          <CardDescription>{financials.currency}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectFinancialsKpiPanel
            projectId={projectId}
            financials={financials}
            canReadProfit={canReadProfit}
            canReadBilling={canReadBilling}
            canReadCommercial={canReadCommercial}
            canReadAp={canReadAp}
            t={t}
          />
        </CardContent>
      </Card>

      {canReadCommercial && (financials.perContract?.length ?? 0) > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('perContract.title')}</CardTitle>
            <CardDescription>{t('perContract.hint')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {financials.perContract!.map((slice) => (
              <div
                key={slice.contractId}
                className="flex min-w-0 flex-col gap-1 rounded-md border border-[var(--pf-border-default)] p-3 text-start sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {slice.name ?? slice.contractType}
                    {slice.isPrimary ? ` · ${t('perContract.primary')}` : null}
                  </p>
                  {slice.skippedForeignCurrency ? (
                    <p className="text-xs text-[var(--pf-text-muted)]">{t('perContract.skippedFx')}</p>
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-col gap-0.5 text-sm sm:text-end">
                  <MoneyText value={slice.position.originalContractValue} compact />
                  <span className="text-[var(--pf-text-secondary)]">
                    <MoneyText value={slice.position.currentContractValue} compact />
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {canReadBilling && cashFlow ? (
        <CashFlowView
          cashFlow={cashFlow}
          copy={{
            title: t('cashFlow.title'),
            actualTitle: t('cashFlow.actualTitle'),
            actualHint: t('cashFlow.actualHint'),
            forecastTitle: t('cashFlow.forecastTitle'),
            forecastHint: t('cashFlow.forecastHint'),
            outgoingTitle: t('cashFlow.outgoingTitle'),
            outgoingDisclosure: t('cashFlow.outgoingDisclosure'),
            outgoingAvailableHint: t('cashFlow.outgoingAvailableHint'),
            undatedNote: t('cashFlow.undatedNote'),
            bucketLabel: (key) => t(`cashFlow.buckets.${key}`),
            paymentCount: (count) => t('cashFlow.paymentCount', { count }),
            billCount: (count) => t('cashFlow.billCount', { count }),
          }}
        />
      ) : null}

      <details className="rounded-lg border border-[var(--pf-border-default)] p-4">
        <summary
          className={cn(
            pressableClassName,
            'inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-[var(--pf-text-brand)] active:scale-100 active:opacity-80',
          )}
        >
          {t('moreInfo')}
        </summary>
        <div className="mt-4 flex flex-col gap-4 text-sm">
          {canReadCommercial && financials.commercial ? (
            <section className="flex flex-col gap-3">
              {financials.commercial.displayOriginalContractValue ? (
                <MetricRow
                  label={t('displayOriginalContractValue')}
                  value={financials.commercial.displayOriginalContractValue}
                  muted
                />
              ) : null}
              {financials.commercial.openingReductionValue ? (
                <MetricRow
                  label={t('openingReductionValue')}
                  value={financials.commercial.openingReductionValue}
                  muted
                />
              ) : null}
              <MetricRow
                label={t('originalContractValue')}
                value={financials.commercial.originalContractValue}
              />
              <MetricRow
                label={t('approvedAdditions')}
                value={financials.commercial.approvedAdditions}
              />
              <MetricRow
                label={t('approvedReductions')}
                value={negateMoney(financials.commercial.approvedReductions)}
              />
              <Separator />
              <MetricRow
                label={t('currentContractValue')}
                value={financials.commercial.currentContractValue}
                emphasis
              />
              <MetricRow
                label={t('pendingChanges')}
                value={financials.commercial.pendingChanges}
                muted
              />
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <p className="text-xs text-[var(--pf-text-secondary)]">
              {financials.coverage.basis === 'fully_loaded'
                ? t('basis.fullyLoaded')
                : t('basis.directOnly')}
            </p>
            <MetricRow
              label={t('costFamilies.direct_project')}
              value={financials.cost.byFamily.directProject}
              nature={t('metricNature.actual')}
            />
            <MetricRow
              label={t('laborActual')}
              value={financials.cost.laborActual}
              nature={t('metricNature.actual')}
            />
            <MetricRow
              label={t('vendorActual')}
              value={financials.cost.vendorActual}
              nature={t('metricNature.actual')}
            />
            <MetricRow
              label={t('overheadActual')}
              value={financials.cost.overheadActual}
              nature={t('metricNature.actual')}
            />
            <MetricRow
              label={t('costFamilies.shared')}
              value={financials.cost.byFamily.shared}
              nature={t('metricNature.actual')}
            />
            <MetricRow
              label={t('costFamilies.asset_capital')}
              value={financials.cost.byFamily.assetCapital}
              nature={t('metricNature.actual')}
            />
            <Separator />
            <MetricRow
              label={t('actualCostToDate')}
              value={financials.cost.actualCostToDate}
              nature={t('metricNature.actual')}
              emphasis
            />
            <MetricRow
              label={t('estimatedFinalCost')}
              value={financials.cost.estimatedFinalCost}
              nature={t('metricNature.forecast')}
            />
            <p className="text-xs text-[var(--pf-text-muted)]">{t('estimatedFinalCostHint')}</p>
            <MetricRow
              label={t('committedOpen')}
              value={financials.cost.committedOpen}
              nature={t('metricNature.committed')}
            />
            <p className="text-xs text-[var(--pf-text-muted)]">{t('committedVsActual')}</p>
            <MetricRow
              label={t('kpis.expectedRemaining')}
              value={financials.cost.expectedRemainingCost}
              nature={t('metricNature.forecast')}
            />
            <p className="text-xs text-[var(--pf-text-muted)]">{t('kpis.expectedRemainingHint')}</p>
            {canUpdateProject ? (
              <ExpectedRemainingCostForm
                projectId={projectId}
                currency={financials.currency}
                initialAmount={financials.cost.expectedRemainingCost.amount}
              />
            ) : null}
            <MetricRow
              label={t('openApPayable')}
              value={financials.cost.openApPayable}
              nature={t('metricNature.forecast')}
            />
            <p className="text-xs text-[var(--pf-text-muted)]">{t('openApPayableHint')}</p>
          </section>

          {billingNotes.map((note) => (
            <p key={note} className="text-xs text-[var(--pf-text-secondary)]">
              {note}
            </p>
          ))}

          {hasCostPartials || coverageSources.length > 0 ? (
            <CoverageDisclosure sources={coverageSources} />
          ) : null}
        </div>
      </details>
    </div>
  );
}

export { ProjectFinancialsSnapshot } from './project-financials-snapshot';

function MetricRow({
  label,
  value,
  emphasis = false,
  muted = false,
  nature,
}: {
  label: string;
  value: { amount: string; currency: string };
  emphasis?: boolean;
  muted?: boolean;
  nature?: string;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <span
        className={
          muted
            ? 'min-w-0 flex-1 break-words text-[var(--pf-text-muted)]'
            : emphasis
              ? 'min-w-0 flex-1 break-words font-medium'
              : 'min-w-0 flex-1 break-words text-[var(--pf-text-secondary)]'
        }
      >
        {label}
        {nature ? (
          <span className="ms-1 text-xs text-[var(--pf-text-muted)]">· {nature}</span>
        ) : null}
      </span>
      <MoneyText
        value={value}
        className={emphasis ? 'shrink-0 font-semibold' : 'shrink-0'}
      />
    </div>
  );
}

export type { ProjectFinancials } from '@/modules/financials/domain/types';
