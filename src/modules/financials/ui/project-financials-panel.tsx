import { getTranslations } from 'next-intl/server';
import { CoverageDisclosure } from '@/components/patterns/coverage-disclosure';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { withOrgContext } from '@/shared/auth/session';
import { negateMoney } from '@/shared/money';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getProjectCashFlowOutlook } from '../application/get-project-cash-flow';
import { getProjectFinancials } from '../application/get-project-financials';
import { CashFlowView } from './cash-flow-view';
import { mapCoverageToSources, standalonePartialNotes } from './map-coverage-sources';
import { ProjectFinancialsSnapshotView } from './project-financials-snapshot-view';

export interface ProjectFinancialsPanelProps {
  readonly projectId: string;
}

/**
 * Embeddable server component for a project workspace Financials tab (doc 45 §5).
 */
export async function ProjectFinancialsPanel({ projectId }: ProjectFinancialsPanelProps) {
  const t = await getTranslations('financial');

  const { financials, cashFlow, canReadProfit, canReadBilling, canReadCommercial } =
    await withOrgContext(async (context) => ({
      financials: await getProjectFinancials(context, projectId),
      cashFlow: await getProjectCashFlowOutlook(context, projectId),
      canReadProfit: hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ),
      canReadBilling: hasPermission(context, PERMISSIONS.BILLING_READ),
      canReadCommercial: hasPermission(context, PERMISSIONS.CONTRACTS_READ),
    }));

  const coverageSources = mapCoverageToSources(financials.coverage, t);
  const hasCostPartials = (financials.coverage.partials?.length ?? 0) > 0;
  const billingNotes = standalonePartialNotes(financials.coverage, t, ['foreign_currency_billing_excluded']);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4">
      {canReadCommercial && financials.commercial ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('currentContractValue')}</CardTitle>
            <CardDescription>{financials.currency}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
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
              label={t('contractValue')}
              value={financials.commercial.currentContractValue}
              emphasis
            />
            <MetricRow
              label={t('pendingChanges')}
              value={financials.commercial.pendingChanges}
              muted
            />
          </CardContent>
        </Card>
      ) : null}

      {canReadBilling ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('invoiced')}</CardTitle>
            <CardDescription>{financials.currency}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <MetricRow
              label={t('invoiced')}
              value={financials.billing.invoiced}
              nature={t('metricNature.actual')}
            />
            <MetricRow
              label={t('paid')}
              value={financials.billing.paid}
              nature={t('metricNature.actual')}
            />
            <MetricRow
              label={t('outstanding')}
              value={financials.billing.outstanding}
              nature={t('metricNature.forecast')}
            />
            {billingNotes.map((note) => (
              <p key={note} className="text-xs text-[var(--pf-text-secondary)]">
                {note}
              </p>
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

      <Card>
        <CardHeader>
          <CardTitle>
            {t('actualCostToDate')}{' '}
            <span className="text-sm font-normal text-[var(--pf-text-secondary)]">
              ({t('metricNature.actual')})
            </span>
          </CardTitle>
          <CardDescription>
            {financials.coverage.basis === 'fully_loaded'
              ? t('basis.fullyLoaded')
              : t('basis.directOnly')}{' '}
            · {financials.currency}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
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
          <MetricRow label={t('costFamilies.shared')} value={financials.cost.byFamily.shared} nature={t('metricNature.actual')} />
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
          <Separator />
          <MetricRow
            label={t('committedOpen')}
            value={financials.cost.committedOpen}
            nature={t('metricNature.committed')}
          />
          <p className="text-xs text-[var(--pf-text-muted)]">{t('committedVsActual')}</p>
          <MetricRow
            label={t('openApPayable')}
            value={financials.cost.openApPayable}
            nature={t('metricNature.forecast')}
          />
          <p className="text-xs text-[var(--pf-text-muted)]">{t('openApPayableHint')}</p>
          {hasCostPartials ? <CoverageDisclosure sources={coverageSources} /> : null}
        </CardContent>
      </Card>

      {canReadProfit && financials.commercial && financials.profit ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('estimatedProfitBasedOnEnteredData')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <MoneyText
                value={financials.profit.estimatedProfit}
                className="text-lg font-semibold"
              />
              {financials.profit.marginPercent !== null ? (
                <span className="text-[var(--pf-text-secondary)]">
                  {t('margin')}:{' '}
                  <span dir="ltr" className="pf-numeric">
                    {financials.profit.marginPercent}%
                  </span>
                </span>
              ) : null}
            </div>
            <CoverageDisclosure sources={coverageSources} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * Compact financial snapshot for the project Overview tab.
 * Returns null when the viewer lacks project financials permission.
 */
export async function ProjectFinancialsSnapshot({ projectId }: ProjectFinancialsPanelProps) {
  const payload = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ)) {
      return null;
    }

    return {
      financials: await getProjectFinancials(context, projectId),
      canReadProfit: hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ),
    };
  });

  if (!payload) {
    return null;
  }

  const t = await getTranslations('financial');

  return (
    <ProjectFinancialsSnapshotView
      financials={payload.financials}
      canReadProfit={payload.canReadProfit}
      t={t}
    />
  );
}

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
