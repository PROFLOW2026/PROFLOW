import { ChevronLeft, ChevronRight, FolderKanban, Plus, Receipt } from 'lucide-react';
import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { CoverageDisclosure } from '@/components/patterns/coverage-disclosure';
import { MoneyText } from '@/components/patterns/money-text';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import type { ExperienceDashboardCard } from '@/modules/tenancy';
import type { ExperiencePersonaKey } from '@/modules/tenancy';
import type { HomeDashboardData } from '../application/get-home-dashboard';
import { mapCoverageToSources, partialNote, standalonePartialNotes } from './map-coverage-sources';
import { DashboardMissingDataTrigger } from './dashboard-missing-data-trigger';
import { mapDashboardMissingDataToView } from './map-dashboard-missing-data-view';
import { partitionDashboardCompletenessItems } from '../domain/dashboard-missing-data';
import { HomeDashboardOwnerView } from './home-dashboard-owner-view';
import { HomeLaborReconciliation, HomePendingTimeAlert } from './home-labor-alerts';
import { DashboardQuickAccessSection } from './dashboard-quick-access-section';
import { DashboardAttentionCards } from './dashboard-attention-cards';
import { DashboardContractSummaryRow } from './dashboard-contract-summary-row';
import { DashboardRecentProjectsSection } from './dashboard-recent-projects-section';
import type { DashboardKpiKey } from '../domain/dashboard-missing-data';
import type { DashboardKpiDetailContent } from '../domain/dashboard-kpi-detail';
import type { MonthCashExpectedLine, MonthCashPaidLine } from '../domain/month-cash-flow';
import { resolveIntlLocale } from '@/shared/i18n/intl-locale';
import {
  buildAllocatedOverheadDetail,
  buildApOutstandingDetail,
  buildBillingInvoicedDetail,
  buildBillingOutstandingDetail,
  buildBillingPaidDetail,
  buildBusinessCashOutstandingDetail,
  buildBusinessCashPaidDetail,
  buildCommitmentsDetail,
  buildCompanyActualDetail,
  buildCompanyProfitDetail,
  buildContractValueDetail,
  buildCostsThisMonthDetail,
  buildCurrentProfitDetail,
  buildExpectedRemainingDetail,
  buildForecastCostDetail,
  buildForecastProfitDetail,
  buildInvoicedThisMonthDetail,
  buildUnallocatedBusinessCostsDetail,
} from '../domain/dashboard-kpi-detail-builders';
import {
  mapDashboardKpiDetailCopy,
  mapDashboardKpiDetailTriggerCopy,
} from './dashboard-kpi-detail-copy';
import { DashboardKpiCard } from './dashboard-kpi-card';

interface HomeDashboardContentProps {
  data: HomeDashboardData;
}

const PROJECT_FIRST_DASHBOARD_PERSONAS = new Set<ExperiencePersonaKey>([
  'project_contractor',
  'renovation',
  'architecture',
  'consulting',
  'mixed',
]);

function shouldUseOwnerDashboard(data: HomeDashboardData): boolean {
  if (data.preferServiceSurface) return false;
  if (PROJECT_FIRST_DASHBOARD_PERSONAS.has(data.persona)) return true;
  return false;
}

export async function HomeDashboardContent({ data }: HomeDashboardContentProps) {
  const [t, locale] = await Promise.all([getTranslations('dashboard'), getLocale()]);
  const tFinancial = await getTranslations('financial');
  const tNav = await getTranslations('nav');

  if (data.isBrandNew) {
    const startKind = data.emptyStartKind ?? 'project';
    const emptyHref =
      startKind === 'work_order'
        ? '/work-orders/new'
        : startKind === 'job'
          ? '/jobs/new'
          : '/projects/new';
    const emptyCopy =
      startKind === 'work_order'
        ? {
            title: t('empty.workOrder.title'),
            body: t('empty.workOrder.body'),
            action: t('empty.workOrder.action'),
          }
        : startKind === 'job'
          ? {
              title: t('empty.job.title'),
              body: t('empty.job.body'),
              action: t('empty.job.action'),
            }
          : {
              title: t('empty.title'),
              body: t('empty.body'),
              action: t('empty.action'),
            };

    return (
      <EmptyState
        icon={FolderKanban}
        title={emptyCopy.title}
        description={emptyCopy.body}
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            {data.canCreateProject ? (
              <Button asChild>
                <Link href={emptyHref} prefetch={false}>
                  <Plus aria-hidden />
                  {emptyCopy.action}
                </Link>
              </Button>
            ) : null}
            {data.canCreateExpense ? (
              <Button asChild variant="secondary">
                <Link href="/expenses/new" prefetch={false}>
                  <Receipt aria-hidden />
                  {tNav('newMenu.expense')}
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />
    );
  }

  if (!data.isBrandNew && shouldUseOwnerDashboard(data)) {
    return <HomeDashboardOwnerView data={data} />;
  }

  const cardSet = new Set(data.dashboardCards);
  const showMoneyChrome =
    cardSet.has('contractValue') ||
    cardSet.has('profit') ||
    cardSet.has('forecast') ||
    cardSet.has('commitments') ||
    cardSet.has('billing') ||
    cardSet.has('collections');

  const coverageSources = data.profitCoverage
    ? mapCoverageToSources(data.profitCoverage, tFinancial)
    : [];
  const contractValueNote =
    data.contractValueCoverage?.partials?.[0] &&
    partialNote(
      data.contractValueCoverage.partials[0].reason,
      data.contractValueCoverage.partials[0].count,
      tFinancial,
    );

  const completenessPartitions = partitionDashboardCompletenessItems(data.missingDataItems);
  const translateDashboard = (key: string, values?: Record<string, string | number>) =>
    t(key, values as Record<string, string | number> | undefined);
  const missingDataItemsView = mapDashboardMissingDataToView(
    completenessPartitions.missing,
    translateDashboard,
    { locale },
  );
  const attentionItemsView = mapDashboardMissingDataToView(
    completenessPartitions.attention,
    translateDashboard,
    { locale },
  );
  const hasCompletenessTrigger =
    missingDataItemsView.length > 0 || attentionItemsView.length > 0;

  const detailCopy = mapDashboardKpiDetailCopy(t);
  const triggerCopy = mapDashboardKpiDetailTriggerCopy(t);
  const kpiBreakdown = data.kpiBreakdown;

  function isKpiUnavailable(key: DashboardKpiKey): boolean {
    return data.kpiAvailability?.[key] === 'unavailable';
  }

  function renderCard(card: ExperienceDashboardCard): ReactNode {
    switch (card) {
      case 'attention':
        return null;

      case 'activeWork':
        if (data.recentProjects.length === 0) return null;
        return (
          <section key={card} className="min-w-0 max-w-full">
            <DashboardRecentProjectsSection
              projects={data.recentProjects}
              workKindFilter={data.workKindFilter}
            />
          </section>
        );

      case 'contractValue':
        if (data.contractSummary) {
          return (
            <section key={card} className="min-w-0 max-w-full">
              <DashboardContractSummaryRow
                summary={data.contractSummary}
                netInvoiced={data.contractNetInvoiced}
              />
            </section>
          );
        }
        if (!data.totalContractValue && !isKpiUnavailable('contractValue')) return null;
        return (
          <section key={card} className="min-w-0 max-w-full">
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DashboardKpiCard
                title={tFinancial('kpis.currentContract')}
                money={isKpiUnavailable('contractValue') ? undefined : data.totalContractValue ?? undefined}
                unavailable={isKpiUnavailable('contractValue')}
                unavailableLabel={t('missingData.kpiUnavailable')}
                unavailableHint={t('missingData.kpiUnavailableContractHint')}
                hint={isKpiUnavailable('contractValue') ? undefined : tFinancial('basis.netExVat')}
                detail={
                  data.totalContractValue && !isKpiUnavailable('contractValue')
                    ? buildContractValueDetail(
                        data.totalContractValue,
                        tFinancial('kpis.currentContract'),
                        detailCopy,
                      )
                    : undefined
                }
                detailCopy={triggerCopy}
                footer={
                  contractValueNote ? (
                    <p className="break-words text-xs text-[var(--pf-text-secondary)]">
                      {contractValueNote}
                    </p>
                  ) : null
                }
              />
            </div>
          </section>
        );

      case 'profit':
        if (
          !data.showProfit ||
          (!data.estimatedProfit && !isKpiUnavailable('estimatedProfit'))
        ) {
          return null;
        }
        return (
          <section key={card} className="min-w-0 max-w-full">
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DashboardKpiCard
                title={t('kpiLabels.expectedProfit')}
                money={
                  isKpiUnavailable('estimatedProfit') ? undefined : data.estimatedProfit ?? undefined
                }
                detail={
                  data.estimatedProfit && !isKpiUnavailable('estimatedProfit')
                    ? buildCurrentProfitDetail(
                        data.estimatedProfit,
                        data.totalContractValue,
                        data.forecast?.totalActualProjectCost ?? data.totalActualCost,
                        t('kpiLabels.expectedProfit'),
                        detailCopy,
                      )
                    : undefined
                }
                detailCopy={triggerCopy}
                unavailable={isKpiUnavailable('estimatedProfit')}
                unavailableLabel={t('missingData.kpiUnavailable')}
                unavailableHint={t('missingData.kpiUnavailableProfitHint')}
                hint={isKpiUnavailable('estimatedProfit') ? undefined : tFinancial('basis.profitNet')}
                footer={<CoverageDisclosure sources={coverageSources} />}
              />
            </div>
          </section>
        );

      case 'forecast':
        if (!data.forecast) return null;
        return (
          <section key={card} className="min-w-0 max-w-full">
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DashboardKpiCard
                title={tFinancial('kpis.forecast')}
                money={
                  isKpiUnavailable('forecastCost')
                    ? undefined
                    : data.forecast.totalForecastFinalCost ?? undefined
                }
                unavailable={isKpiUnavailable('forecastCost')}
                unavailableLabel={t('missingData.kpiUnavailable')}
                unavailableHint={t('missingData.kpiUnavailableCostHint')}
                hint={isKpiUnavailable('forecastCost') ? undefined : tFinancial('basis.netExVat')}
                detail={
                  data.forecast.totalForecastFinalCost && !isKpiUnavailable('forecastCost')
                    ? buildForecastCostDetail(
                        data.forecast.totalForecastFinalCost,
                        {
                          actualCost: data.forecast.totalActualProjectCost,
                          committed: kpiBreakdown?.committed ?? data.forecast.totalRemainingCommitments,
                          expectedRemaining:
                            kpiBreakdown?.expectedRemaining ?? data.forecast.totalExpectedRemaining,
                        },
                        tFinancial('kpis.forecast'),
                        detailCopy,
                      )
                    : undefined
                }
                detailCopy={triggerCopy}
              />
              <DashboardKpiCard
                title={tFinancial('kpis.expectedRemaining')}
                money={
                  isKpiUnavailable('forecastCost')
                    ? undefined
                    : data.forecast.totalExpectedRemaining ?? undefined
                }
                unavailable={isKpiUnavailable('forecastCost')}
                unavailableLabel={t('missingData.kpiUnavailable')}
                unavailableHint={t('missingData.kpiUnavailableCostHint')}
                detail={
                  data.forecast.totalExpectedRemaining && !isKpiUnavailable('forecastCost')
                    ? buildExpectedRemainingDetail(
                        data.forecast.totalExpectedRemaining,
                        {
                          actualCost: data.forecast.totalActualProjectCost,
                          committed: kpiBreakdown?.committed ?? data.forecast.totalRemainingCommitments,
                        },
                        tFinancial('kpis.expectedRemaining'),
                        detailCopy,
                      )
                    : undefined
                }
                detailCopy={triggerCopy}
              />
              <DashboardKpiCard
                title={tFinancial('kpis.allocatedOverhead')}
                money={
                  isKpiUnavailable('actualCost')
                    ? undefined
                    : data.forecast.totalAllocatedOverhead ?? undefined
                }
                unavailable={isKpiUnavailable('actualCost')}
                unavailableLabel={t('missingData.kpiUnavailable')}
                unavailableHint={t('missingData.kpiUnavailableCostHint')}
                detail={
                  data.forecast.totalAllocatedOverhead && !isKpiUnavailable('actualCost')
                    ? buildAllocatedOverheadDetail(
                        data.forecast.totalAllocatedOverhead,
                        tFinancial('kpis.allocatedOverhead'),
                        detailCopy,
                      )
                    : undefined
                }
                detailCopy={triggerCopy}
              />
              {data.showProfit && data.forecast.totalActualMargin ? (
                <DashboardKpiCard
                  title={t('kpiLabels.currentProfit')}
                  money={
                    isKpiUnavailable('actualMargin')
                      ? undefined
                      : data.forecast.totalActualMargin
                  }
                  unavailable={isKpiUnavailable('actualMargin')}
                  unavailableLabel={t('missingData.kpiUnavailable')}
                  unavailableHint={t('missingData.kpiUnavailableProfitHint')}
                  hint={isKpiUnavailable('actualMargin') ? undefined : tFinancial('basis.profitNet')}
                  detail={
                    !isKpiUnavailable('actualMargin')
                      ? buildCurrentProfitDetail(
                          data.forecast.totalActualMargin,
                          data.totalContractValue,
                          data.forecast.totalActualProjectCost,
                          t('kpiLabels.currentProfit'),
                          detailCopy,
                        )
                      : undefined
                  }
                  detailCopy={triggerCopy}
                />
              ) : isKpiUnavailable('actualMargin') ? (
                <DashboardKpiCard
                  title={t('kpiLabels.currentProfit')}
                  unavailable
                  unavailableLabel={t('missingData.kpiUnavailable')}
                  unavailableHint={t('missingData.kpiUnavailableProfitHint')}
                />
              ) : null}
              {data.showProfit && data.forecast.totalForecastMargin ? (
                <DashboardKpiCard
                  title={t('kpiLabels.expectedProfit')}
                  money={
                    isKpiUnavailable('forecastMargin')
                      ? undefined
                      : data.forecast.totalForecastMargin
                  }
                  unavailable={isKpiUnavailable('forecastMargin')}
                  unavailableLabel={t('missingData.kpiUnavailable')}
                  unavailableHint={t('missingData.kpiUnavailableProfitHint')}
                  hint={
                    isKpiUnavailable('forecastMargin') ? undefined : tFinancial('basis.profitNet')
                  }
                  detail={
                    !isKpiUnavailable('forecastMargin')
                      ? buildForecastProfitDetail(
                          data.forecast.totalForecastMargin,
                          data.totalContractValue,
                          data.forecast.totalForecastFinalCost,
                          t('kpiLabels.expectedProfit'),
                          detailCopy,
                        )
                      : undefined
                  }
                  detailCopy={triggerCopy}
                />
              ) : isKpiUnavailable('forecastMargin') ? (
                <DashboardKpiCard
                  title={t('kpiLabels.expectedProfit')}
                  unavailable
                  unavailableLabel={t('missingData.kpiUnavailable')}
                  unavailableHint={t('missingData.kpiUnavailableProfitHint')}
                />
              ) : null}
              {data.forecast.companyActual != null ? (
                <DashboardKpiCard
                  title={tFinancial('companyActual')}
                  money={data.forecast.companyActual}
                  hint={tFinancial('companyActualDashboardHint')}
                  detail={
                    kpiBreakdown
                      ? buildCompanyActualDetail(
                          data.forecast.companyActual,
                          kpiBreakdown,
                          tFinancial('companyActual'),
                          detailCopy,
                        )
                      : undefined
                  }
                  detailCopy={triggerCopy}
                />
              ) : null}
              {data.businessCashPosition?.actualPaid ? (
                <DashboardKpiCard
                  title={tFinancial('businessCashPaid')}
                  money={data.businessCashPosition.actualPaid}
                  hint={tFinancial('businessCashPaidHint')}
                  detail={buildBusinessCashPaidDetail(
                    data.businessCashPosition,
                    tFinancial('businessCashPaid'),
                    detailCopy,
                  )}
                  detailCopy={triggerCopy}
                />
              ) : null}
              {data.businessCashPosition?.outstandingPayable ? (
                <DashboardKpiCard
                  title={tFinancial('businessCashOutstanding')}
                  money={data.businessCashPosition.outstandingPayable}
                  hint={tFinancial('businessCashOutstandingHint')}
                  detail={buildBusinessCashOutstandingDetail(
                    data.businessCashPosition,
                    tFinancial('businessCashOutstanding'),
                    detailCopy,
                  )}
                  detailCopy={triggerCopy}
                />
              ) : null}
              {data.forecast.companyProfit != null ? (
                <DashboardKpiCard
                  title={tFinancial('companyProfit')}
                  money={data.forecast.companyProfit}
                  hint={tFinancial('basis.profitNet')}
                  detail={
                    kpiBreakdown && data.forecast.companyActual
                      ? buildCompanyProfitDetail(
                          data.forecast.companyProfit,
                          kpiBreakdown,
                          data.forecast.companyActual,
                          tFinancial('companyProfit'),
                          detailCopy,
                        )
                      : undefined
                  }
                  detailCopy={triggerCopy}
                />
              ) : null}
              {data.forecast.unallocatedBusinessCosts != null ? (
                <DashboardKpiCard
                  title={tFinancial('unallocatedBusinessCosts')}
                  money={data.forecast.unallocatedBusinessCosts}
                  detail={
                    kpiBreakdown
                      ? buildUnallocatedBusinessCostsDetail(
                          data.forecast.unallocatedBusinessCosts,
                          kpiBreakdown,
                          tFinancial('unallocatedBusinessCosts'),
                          detailCopy,
                        )
                      : undefined
                  }
                  detailCopy={triggerCopy}
                  footer={
                    <p className="break-words text-xs text-[var(--pf-text-secondary)]">
                      {tFinancial('unallocatedBusinessCostsHint')}
                      {' '}
                      <Link
                        href="/expenses?projectId=unallocated"
                        className={textNavLinkClassName}
                        prefetch={false}
                      >
                        {t('businessSummary.viewUnallocatedExpenses')}
                      </Link>
                    </p>
                  }
                />
              ) : null}
            </div>
          </section>
        );

      case 'commitments':
        if (!data.forecast) return null;
        return (
          <section key={card} className="min-w-0 max-w-full">
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DashboardKpiCard
                title={tFinancial('kpis.committed')}
                money={
                  isKpiUnavailable('committed')
                    ? undefined
                    : data.forecast.totalRemainingCommitments ?? undefined
                }
                unavailable={isKpiUnavailable('committed')}
                unavailableLabel={t('missingData.kpiUnavailable')}
                unavailableHint={t('missingData.kpiUnavailableCostHint')}
                detail={
                  data.forecast.totalRemainingCommitments && !isKpiUnavailable('committed')
                    ? buildCommitmentsDetail(
                        data.forecast.totalRemainingCommitments,
                        tFinancial('kpis.committed'),
                        detailCopy,
                      )
                    : undefined
                }
                detailCopy={triggerCopy}
              />
            </div>
          </section>
        );

      case 'billing':
        if (!(data.showBilling && data.billing)) return null;
        return (
          <section key={card} className="min-w-0 max-w-full">
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
              <DashboardKpiCard
                title={tFinancial('kpis.billed')}
                money={data.billing.netInvoiced}
                grossMoney={data.billing.invoiced}
                grossLabel={tFinancial('kpis.includingVat')}
                hint={tFinancial('kpis.billedHint')}
                detail={buildBillingInvoicedDetail(
                  data.billing.netInvoiced,
                  data.billing.invoiced,
                  tFinancial('kpis.billed'),
                  detailCopy,
                )}
                detailCopy={triggerCopy}
                footer={(() => {
                  if (!data.billingCoverage) return null;
                  const notes = standalonePartialNotes(data.billingCoverage, tFinancial, [
                    'foreign_currency_billing_excluded',
                  ]);
                  if (notes.length === 0) return null;
                  return notes.map((note) => (
                    <p key={note} className="break-words text-xs text-[var(--pf-text-secondary)]">
                      {note}
                    </p>
                  ));
                })()}
              />
              <DashboardKpiCard
                title={tFinancial('kpis.paid')}
                money={data.billing.netPaid}
                grossMoney={data.billing.paid}
                grossLabel={tFinancial('kpis.includingVat')}
                hint={tFinancial('kpis.paidHint')}
                detail={buildBillingPaidDetail(
                  data.billing.netPaid,
                  data.billing.paid,
                  tFinancial('kpis.paid'),
                  detailCopy,
                )}
                detailCopy={triggerCopy}
              />
            </div>
          </section>
        );

      case 'collections': {
        const hasAr = data.showBilling && data.billing;
        const hasAp = data.apOutstanding != null;
        if (!hasAr && !hasAp) return null;
        return (
          <section key={card} className="min-w-0 max-w-full">
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
              {hasAr ? (
                <DashboardKpiCard
                  title={tFinancial('kpis.outstandingNet')}
                  money={data.billing!.netOutstanding}
                  grossMoney={data.billing!.outstanding}
                  grossLabel={tFinancial('kpis.includingVat')}
                  hint={tFinancial('basis.outstandingNet')}
                  detail={buildBillingOutstandingDetail(
                    data.billing!.netOutstanding,
                    data.billing!.outstanding,
                    data.billing!.netInvoiced,
                    data.billing!.netPaid,
                    tFinancial('kpis.outstandingNet'),
                    detailCopy,
                  )}
                  detailCopy={triggerCopy}
                />
              ) : null}
              {data.businessCashPosition?.outstandingPayable ? (
                <DashboardKpiCard
                  title={tFinancial('businessCashOutstanding')}
                  money={data.businessCashPosition.outstandingPayable}
                  hint={tFinancial('businessCashOutstandingHint')}
                  detail={buildBusinessCashOutstandingDetail(
                    data.businessCashPosition,
                    tFinancial('businessCashOutstanding'),
                    detailCopy,
                  )}
                  detailCopy={triggerCopy}
                />
              ) : hasAp ? (
                <DashboardKpiCard
                  title={tFinancial('apOutstanding')}
                  money={data.apOutstanding!}
                  hint={tFinancial('apOutstandingHint')}
                  detail={buildApOutstandingDetail(
                    data.apOutstanding!,
                    tFinancial('apOutstanding'),
                    detailCopy,
                  )}
                  detailCopy={triggerCopy}
                  footer={
                    <p className="break-words text-xs">
                      <Link
                        href="/procurement/ap?status=open"
                        className={textNavLinkClassName}
                        prefetch={false}
                      >
                        {t('businessSummary.viewApOutstanding')}
                      </Link>
                    </p>
                  }
                />
              ) : null}
            </div>
          </section>
        );
      }

      case 'serviceToday':
        return (
          <section key={card} className="min-w-0 max-w-full">
            <h2 className="mb-2 text-sm font-semibold">{t('cards.serviceToday.title')}</h2>
            <p className="text-sm text-[var(--pf-text-secondary)]">
              {data.preferServiceSurface
                ? t('cards.serviceToday.bodyService')
                : t('cards.serviceToday.body')}
            </p>
            <p className="mt-2">
              <Link href="/today" className={textNavLinkClassName} prefetch={false}>
                {t('attention.linkToday')}
              </Link>
            </p>
          </section>
        );

      case 'timeUtilization':
        return (
          <section key={card} className="min-w-0 max-w-full">
            <h2 className="mb-2 text-sm font-semibold">{t('cards.timeUtilization.title')}</h2>
            <p className="mb-3 text-sm text-[var(--pf-text-secondary)]">
              {t('cards.timeUtilization.body')}
            </p>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              {data.activeProjectCount > 0 ? (
                <DashboardKpiCard title={t('activeProjects')} value={String(data.activeProjectCount)} />
              ) : null}
              {data.attention.pendingChangesCount +
                data.attention.unbilledApprovedCount +
                data.attention.overdueBillingCount >
              0 ? (
                <DashboardKpiCard
                  title={t('attention.title')}
                  value={String(
                    data.attention.pendingChangesCount +
                      data.attention.unbilledApprovedCount +
                      data.attention.overdueBillingCount,
                  )}
                />
              ) : null}
            </div>
            <p className="mt-2">
              <Link href="/workforce/time" className={textNavLinkClassName} prefetch={false}>
                {tNav('time')}
              </Link>
            </p>
          </section>
        );

      case 'quotePipeline':
        if (!data.showQuotes) return null;
        return (
          <section key={card} className="min-w-0 max-w-full">
            <h2 className="mb-2 text-sm font-semibold">{t('cards.quotePipeline.title')}</h2>
            <p className="mb-2 text-sm text-[var(--pf-text-secondary)]">
              {t('cards.quotePipeline.body')}
            </p>
            <Link href="/quotes" className={textNavLinkClassName} prefetch={false}>
              {tNav('quotes')}
            </Link>
          </section>
        );

      case 'firstActions':
        return (
          <section key={card} className="min-w-0 max-w-full">
            <h2 className="mb-3 text-sm font-semibold">{t('quickActions')}</h2>
            <div className="flex min-w-0 max-w-full flex-wrap gap-2">
              {data.canCreateProject ? (
                <Button asChild size="sm" variant="secondary">
                  <Link
                    href={
                      data.emptyStartKind === 'work_order'
                        ? '/work-orders/new'
                        : data.emptyStartKind === 'job'
                          ? '/jobs/new'
                          : '/projects/new'
                    }
                    prefetch={false}
                  >
                    {data.emptyStartKind === 'work_order'
                      ? tNav('newMenu.service')
                      : data.emptyStartKind === 'job'
                        ? tNav('newMenu.job')
                        : tNav('newMenu.project')}
                  </Link>
                </Button>
              ) : null}
              {data.canCreateExpense ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href="/expenses/new" prefetch={false}>
                    {tNav('newMenu.expense')}
                  </Link>
                </Button>
              ) : null}
            </div>
          </section>
        );

      default:
        return null;
    }
  }

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4">
      {showMoneyChrome ? (
        <div className="mb-0 flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--pf-text-secondary)]">
            {t('businessSummary.title')}
          </h2>
          {hasCompletenessTrigger ? (
            <DashboardMissingDataTrigger
              missingItems={missingDataItemsView}
              attentionItems={attentionItemsView}
              copy={{
                missingButtonOne: t('missingData.missingButtonOne'),
                missingButtonMany: t.raw('missingData.missingButtonMany') as string,
                attentionButtonOne: t('missingData.attentionButtonOne'),
                attentionButtonMany: t.raw('missingData.attentionButtonMany') as string,
                modalTitle: t('missingData.modalTitle'),
                modalDescription: t('missingData.modalDescription'),
                sectionMissing: t('missingData.sectionMissing'),
                sectionAttention: t('missingData.sectionAttention'),
                missingItemLabel: t('missingData.missingItemLabel'),
                attentionItemLabel: t('missingData.attentionItemLabel'),
              }}
            />
          ) : null}
        </div>
      ) : null}

      {data.pendingTime ? (
        <HomePendingTimeAlert pendingTime={data.pendingTime} canApproveTime={data.canApproveTime} />
      ) : null}
      {data.laborReconciliation ? (
        <HomeLaborReconciliation laborReconciliation={data.laborReconciliation} />
      ) : null}

      <DashboardQuickAccessSection shortcuts={data.quickAccessShortcuts} />
      <DashboardAttentionCards attention={data.attention} />

      {data.dashboardCards.map((card) => renderCard(card))}

      {data.organizationSummary &&
      (cardSet.has('billing') || cardSet.has('collections') || cardSet.has('profit')) ? (
        <>
          {/* Month navigation for costsThisMonth / invoicedThisMonth KPIs */}
          <MonthNavigation
            selectedMonth={data.selectedMonth}
            locale={locale}
            workKindFilter={data.workKindFilter}
            prevLabel={t('businessSummary.prevMonth')}
            nextLabel={t('businessSummary.nextMonth')}
          />
          <section className="min-w-0 max-w-full">
            <h3 className="mb-2 text-sm font-semibold text-[var(--pf-text-secondary)]">
              {t('businessSummary.cashFlowTitle')}
            </h3>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.showBilling && cardSet.has('collections') ? (
                <DashboardKpiCard
                  title={t('businessSummary.collectionsActual')}
                  money={data.organizationSummary.monthCash.collectionsActual}
                  hint={t('businessSummary.collectionsActualHint')}
                  detail={monthCashTotalDetail(
                    t('businessSummary.collectionsActual'),
                    data.organizationSummary.monthCash.collectionsActual,
                    t('businessSummary.collectionsActualWhat'),
                    t('businessSummary.collectionsActualFormula'),
                  )}
                  detailCopy={triggerCopy}
                />
              ) : null}
              <DashboardKpiCard
                title={t('businessSummary.paidActual')}
                money={data.organizationSummary.monthCash.paidActual}
                hint={t('businessSummary.paidActualHint')}
                detail={monthCashPaidDetail(
                  data.organizationSummary.monthCash.paidLines,
                  data.organizationSummary.monthCash.paidActual,
                  t('businessSummary.paidActual'),
                  t('businessSummary.paidActualWhat'),
                  t('businessSummary.paidActualFormula'),
                  t('businessSummary.cashMore', {
                    count: Math.max(0, data.organizationSummary.monthCash.paidLines.length - 40),
                  }),
                )}
                detailCopy={triggerCopy}
              />
              <DashboardKpiCard
                title={t('businessSummary.expectedOutgoing')}
                money={data.organizationSummary.monthCash.expectedOutgoing}
                hint={t('businessSummary.expectedOutgoingHint')}
                detail={monthCashExpectedDetail(
                  data.organizationSummary.monthCash.expectedLines,
                  data.organizationSummary.monthCash.expectedOutgoing,
                  t('businessSummary.expectedOutgoing'),
                  t('businessSummary.expectedOutgoingWhat'),
                  t('businessSummary.expectedOutgoingFormula'),
                  {
                    unpaid: t('businessSummary.cashStatusUnpaid'),
                    partial: t('businessSummary.cashStatusPartial'),
                    open: t('businessSummary.cashStatusOpen'),
                  },
                  t('businessSummary.cashMore', {
                    count: Math.max(0, data.organizationSummary.monthCash.expectedLines.length - 40),
                  }),
                )}
                detailCopy={triggerCopy}
              />
              <DashboardKpiCard
                title={t('businessSummary.netCash')}
                money={data.organizationSummary.monthCash.netCash}
                hint={t('businessSummary.netCashHint')}
                detail={monthCashTotalDetail(
                  t('businessSummary.netCash'),
                  data.organizationSummary.monthCash.netCash,
                  t('businessSummary.netCashWhat'),
                  t('businessSummary.netCashFormula'),
                )}
                detailCopy={triggerCopy}
              />
            </div>
            <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">
              {t('businessSummary.forecastAfterRemaining')}{' '}
              <MoneyText
                value={data.organizationSummary.monthCash.forecastAfterRemaining}
                className="font-semibold"
                colorizeNegative
              />
            </p>
          </section>
          <section className="min-w-0 max-w-full">
            <h3 className="mb-2 text-sm font-semibold text-[var(--pf-text-secondary)]">
              {t('businessSummary.profitabilityTitle')}
            </h3>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              {data.showBilling && cardSet.has('billing') ? (
                <DashboardKpiCard
                  title={t('businessSummary.invoicedThisMonth')}
                  money={data.organizationSummary.invoicedThisMonth}
                  grossMoney={data.organizationSummary.grossInvoicedThisMonth}
                  grossLabel={tFinancial('kpis.includingVat')}
                  hint={tFinancial('kpis.billedHint')}
                  detail={buildInvoicedThisMonthDetail(
                    data.organizationSummary.invoicedThisMonth,
                    data.organizationSummary.grossInvoicedThisMonth,
                    data.selectedMonth,
                    t('businessSummary.invoicedThisMonth'),
                    detailCopy,
                  )}
                  detailCopy={triggerCopy}
                />
              ) : null}
              <DashboardKpiCard
                title={t('businessSummary.costsThisMonth')}
                money={data.organizationSummary.costsThisMonth}
                hint={tFinancial('basis.actualNotCash')}
                detail={buildCostsThisMonthDetail(
                  data.organizationSummary.costsThisMonth,
                  data.selectedMonth,
                  t('businessSummary.costsThisMonth'),
                  detailCopy,
                )}
                detailCopy={triggerCopy}
              />
            </div>
          </section>
        </>
      ) : null}

      <section className="flex min-w-0 flex-wrap gap-3 text-sm">
        <Link href="/cash-flow" className={textNavLinkClassName}>
          {t('ownerLinks.cashFlow')}
        </Link>
        <Link href="/reports?section=management" className={textNavLinkClassName}>
          {t('ownerLinks.management')}
        </Link>
      </section>
    </div>
  );
}

const MONTH_CASH_DETAIL_CAP = 40;

function monthCashTotalDetail(
  title: string,
  value: DashboardKpiDetailContent['value'],
  whatIs: string,
  formula: string,
): DashboardKpiDetailContent {
  return { title, value, whatIs, formula, breakdown: [] };
}

function monthCashPaidDetail(
  lines: readonly MonthCashPaidLine[],
  total: NonNullable<DashboardKpiDetailContent['value']>,
  title: string,
  whatIs: string,
  formula: string,
  moreLabel: string,
): DashboardKpiDetailContent {
  const visible = lines.slice(0, MONTH_CASH_DETAIL_CAP);
  const hidden = lines.length - visible.length;
  return {
    title,
    value: total,
    whatIs: hidden > 0 ? `${whatIs} ${moreLabel}` : whatIs,
    formula,
    breakdown: visible.map((line) => ({
      label: [line.party, line.document, line.paymentDate, line.reference].filter(Boolean).join(' · '),
      money: line.amount,
    })),
  };
}

function monthCashExpectedDetail(
  lines: readonly MonthCashExpectedLine[],
  total: NonNullable<DashboardKpiDetailContent['value']>,
  title: string,
  whatIs: string,
  formula: string,
  statusLabels: Readonly<Record<string, string>>,
  moreLabel: string,
): DashboardKpiDetailContent {
  const visible = lines.slice(0, MONTH_CASH_DETAIL_CAP);
  const hidden = lines.length - visible.length;
  return {
    title,
    value: total,
    whatIs: hidden > 0 ? `${whatIs} ${moreLabel}` : whatIs,
    formula,
    breakdown: visible.map((line) => ({
      label: [
        line.party,
        line.document,
        line.dueDate,
        line.paymentTerms,
        statusLabels[line.status] ?? line.status,
      ]
        .filter(Boolean)
        .join(' · '),
      money: line.remaining,
    })),
  };
}

/** Month navigator: ← Sep 2026 → links that change the `?month=YYYY-MM` query param. */
function MonthNavigation({
  selectedMonth,
  locale,
  workKindFilter,
  prevLabel,
  nextLabel,
}: {
  selectedMonth: string;
  locale: string;
  workKindFilter: string | null;
  prevLabel: string;
  nextLabel: string;
}) {
  const parts = selectedMonth.split('-');
  const year = parseInt(parts[0] ?? '2024', 10);
  const month = parseInt(parts[1] ?? '1', 10); // 1-indexed

  // Compute prev / next month strings.
  const prevDate = new Date(year, month - 2, 1);
  const nextDate = new Date(year, month, 1);
  const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const nextMonthStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;

  // Block navigation past the current month.
  const todayMonthStr = new Date().toISOString().slice(0, 7);
  const isCurrentOrFuture = selectedMonth >= todayMonthStr;

  // Format month display label in the UI locale.
  const displayDate = new Date(year, month - 1, 1);
  const monthLabel = new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    month: 'long',
    year: 'numeric',
  }).format(displayDate);

  const buildUrl = (m: string) => {
    const params = new URLSearchParams();
    params.set('month', m);
    if (workKindFilter && workKindFilter !== 'all') {
      params.set('workKind', workKindFilter);
    }
    return `/?${params.toString()}`;
  };

  return (
    <div className="flex min-w-0 items-center gap-2" dir="ltr">
      <Link
        href={buildUrl(prevMonthStr)}
        className={cn(textNavLinkClassName, 'flex items-center rounded p-1')}
        prefetch={false}
        scroll={false}
        aria-label={prevLabel}
      >
        <ChevronLeft className="size-4" aria-hidden />
      </Link>
      <span className="min-w-[8rem] text-center text-sm font-medium">{monthLabel}</span>
      {!isCurrentOrFuture ? (
        <Link
          href={buildUrl(nextMonthStr)}
          className={cn(textNavLinkClassName, 'flex items-center rounded p-1')}
          prefetch={false}
          scroll={false}
          aria-label={nextLabel}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span
          className="flex items-center rounded p-1 text-[var(--pf-text-muted)] opacity-40"
          aria-hidden
        >
          <ChevronRight className="size-4" />
        </span>
      )}
    </div>
  );
}
