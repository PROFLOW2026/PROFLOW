import { AlertCircle, FolderKanban, Plus, Receipt } from 'lucide-react';
import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { CoverageDisclosure } from '@/components/patterns/coverage-disclosure';
import { MoneyText } from '@/components/patterns/money-text';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PrefetchOnIntentLink } from '@/components/ui/prefetch-on-intent-link';
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
import type { DashboardKpiKey } from '../domain/dashboard-missing-data';

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

  const hasAttention =
    data.attention.pendingChangesCount > 0 ||
    data.attention.unbilledApprovedCount > 0 ||
    data.attention.overdueBillingCount > 0;

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

  function isKpiUnavailable(key: DashboardKpiKey): boolean {
    return data.kpiAvailability?.[key] === 'unavailable';
  }

  function renderCard(card: ExperienceDashboardCard): ReactNode {
    switch (card) {
      case 'attention':
        if (!hasAttention) return null;
        return (
          <section key={card} className="min-w-0 max-w-full">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              {t('attention.title')}
            </h2>
            {data.canReadToday ? (
              <p className="mb-3">
                <Link href="/today" className={textNavLinkClassName} prefetch={false}>
                  {t('attention.linkToday')}
                </Link>
              </p>
            ) : null}
            <ul className="flex min-w-0 flex-col gap-2 text-sm">
              {(data.preferServiceSurface
                ? (['overdueBilling', 'unbilledApproved', 'pendingChanges'] as const)
                : (['pendingChanges', 'unbilledApproved', 'overdueBilling'] as const)
              ).map((key) => {
                const count =
                  key === 'overdueBilling'
                    ? data.attention.overdueBillingCount
                    : key === 'unbilledApproved'
                      ? data.attention.unbilledApprovedCount
                      : data.attention.pendingChangesCount;
                if (count <= 0) return null;
                const text =
                  key === 'overdueBilling'
                    ? t('attention.overdueBilling', { count })
                    : key === 'unbilledApproved'
                      ? t('attention.approvedNotBilled', { count })
                      : t('attention.pendingChanges', { count });
                return (
                  <li
                    key={key}
                    className="min-w-0 break-words rounded-md border border-[var(--pf-border-default)] px-3 py-2"
                  >
                    {text}
                  </li>
                );
              })}
            </ul>
          </section>
        );

      case 'activeWork':
        return (
          <section key={card} className="min-w-0 max-w-full">
            <div className="mb-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              {data.activeProjectCount > 0 ? (
                <KpiCard title={t('activeProjects')} value={String(data.activeProjectCount)} />
              ) : null}
            </div>
            {data.recentProjects.length > 0 ? (
              <>
                <h2 className="mb-3 text-sm font-semibold">{t('activeProjects')}</h2>
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                  {data.recentProjects.map((project) => (
                    <Card key={project.id} className="min-w-0 max-w-full">
                      <CardHeader className="py-3">
                        <CardTitle className="min-w-0 break-words text-base">
                          <PrefetchOnIntentLink
                            href={`/projects/${project.id}`}
                            className={cn(textNavLinkClassName, 'font-medium')}
                          >
                            {project.name}
                          </PrefetchOnIntentLink>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="min-w-0 pb-3 text-sm text-[var(--pf-text-secondary)]">
                        {project.clientName ?? '-'}
                        {project.currentContractValue && project.currency ? (
                          <p className="mt-1 min-w-0 max-w-full overflow-x-auto">
                            <MoneyText
                              value={{
                                amount: project.currentContractValue,
                                currency: project.currency,
                              }}
                              compact
                            />
                          </p>
                        ) : null}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        );

      case 'contractValue':
        if (!data.totalContractValue && !isKpiUnavailable('contractValue')) return null;
        return (
          <section key={card} className="min-w-0 max-w-full">
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title={tFinancial('kpis.currentContract')}
                money={isKpiUnavailable('contractValue') ? undefined : data.totalContractValue ?? undefined}
                unavailable={isKpiUnavailable('contractValue')}
                unavailableLabel={t('missingData.kpiUnavailable')}
                unavailableHint={t('missingData.kpiUnavailableContractHint')}
                hint={isKpiUnavailable('contractValue') ? undefined : tFinancial('basis.netExVat')}
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
              <KpiCard
                title={tFinancial('kpis.forecastMargin')}
                money={
                  isKpiUnavailable('estimatedProfit') ? undefined : data.estimatedProfit ?? undefined
                }
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
              <KpiCard
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
              />
              <KpiCard
                title={tFinancial('kpis.expectedRemaining')}
                money={
                  isKpiUnavailable('forecastCost')
                    ? undefined
                    : data.forecast.totalExpectedRemaining ?? undefined
                }
                unavailable={isKpiUnavailable('forecastCost')}
                unavailableLabel={t('missingData.kpiUnavailable')}
                unavailableHint={t('missingData.kpiUnavailableCostHint')}
              />
              <KpiCard
                title={tFinancial('kpis.allocatedOverhead')}
                money={
                  isKpiUnavailable('actualCost')
                    ? undefined
                    : data.forecast.totalAllocatedOverhead ?? undefined
                }
                unavailable={isKpiUnavailable('actualCost')}
                unavailableLabel={t('missingData.kpiUnavailable')}
                unavailableHint={t('missingData.kpiUnavailableCostHint')}
              />
              {data.showProfit && data.forecast.totalActualMargin ? (
                <KpiCard
                  title={tFinancial('kpis.actualMargin')}
                  money={
                    isKpiUnavailable('actualMargin')
                      ? undefined
                      : data.forecast.totalActualMargin
                  }
                  unavailable={isKpiUnavailable('actualMargin')}
                  unavailableLabel={t('missingData.kpiUnavailable')}
                  unavailableHint={t('missingData.kpiUnavailableProfitHint')}
                  hint={isKpiUnavailable('actualMargin') ? undefined : tFinancial('basis.profitNet')}
                />
              ) : isKpiUnavailable('actualMargin') ? (
                <KpiCard
                  title={tFinancial('kpis.actualMargin')}
                  unavailable
                  unavailableLabel={t('missingData.kpiUnavailable')}
                  unavailableHint={t('missingData.kpiUnavailableProfitHint')}
                />
              ) : null}
              {data.showProfit && data.forecast.totalForecastMargin ? (
                <KpiCard
                  title={tFinancial('kpis.forecastMargin')}
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
                />
              ) : isKpiUnavailable('forecastMargin') ? (
                <KpiCard
                  title={tFinancial('kpis.forecastMargin')}
                  unavailable
                  unavailableLabel={t('missingData.kpiUnavailable')}
                  unavailableHint={t('missingData.kpiUnavailableProfitHint')}
                />
              ) : null}
              {data.forecast.companyActual != null ? (
                <KpiCard
                  title={tFinancial('companyActual')}
                  money={data.forecast.companyActual}
                  hint={tFinancial('allocatedGeneralInProjectActualHint')}
                />
              ) : null}
              {data.forecast.companyProfit != null ? (
                <KpiCard
                  title={tFinancial('companyProfit')}
                  money={data.forecast.companyProfit}
                  hint={tFinancial('basis.profitNet')}
                />
              ) : null}
              {data.forecast.unallocatedBusinessCosts != null ? (
                <KpiCard
                  title={tFinancial('unallocatedBusinessCosts')}
                  money={data.forecast.unallocatedBusinessCosts}
                  footer={
                    <p className="break-words text-xs text-[var(--pf-text-secondary)]">
                      {tFinancial('unallocatedBusinessCostsHint')}
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
              <KpiCard
                title={tFinancial('kpis.committed')}
                money={
                  isKpiUnavailable('committed')
                    ? undefined
                    : data.forecast.totalRemainingCommitments ?? undefined
                }
                unavailable={isKpiUnavailable('committed')}
                unavailableLabel={t('missingData.kpiUnavailable')}
                unavailableHint={t('missingData.kpiUnavailableCostHint')}
              />
            </div>
          </section>
        );

      case 'billing':
        if (!(data.showBilling && data.billing)) return null;
        return (
          <section key={card} className="min-w-0 max-w-full">
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
              <KpiCard
                title={tFinancial('kpis.billed')}
                money={data.billing.invoiced}
                hint={tFinancial('basis.billingCash')}
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
              <KpiCard
                title={tFinancial('kpis.paid')}
                money={data.billing.paid}
                hint={tFinancial('basis.billingCash')}
              />
            </div>
          </section>
        );

      case 'collections':
        if (!(data.showBilling && data.billing)) return null;
        return (
          <section key={card} className="min-w-0 max-w-full">
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
              <KpiCard
                title={tFinancial('kpis.outstanding')}
                money={data.billing.outstanding}
                hint={tFinancial('basis.outstandingCash')}
              />
              {data.organizationSummary && data.showBilling ? (
                <KpiCard
                  title={t('businessSummary.outstanding')}
                  money={data.organizationSummary.outstanding}
                  hint={tFinancial('basis.outstandingCash')}
                />
              ) : null}
            </div>
          </section>
        );

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
                <KpiCard title={t('activeProjects')} value={String(data.activeProjectCount)} />
              ) : null}
              {hasAttention ? (
                <KpiCard
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
        if (!(data.canCreateProject || data.canCreateExpense)) return null;
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
    <div className="flex min-w-0 max-w-full flex-col gap-6">
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

      {data.dashboardCards.map((card) => renderCard(card))}

      {data.organizationSummary &&
      (cardSet.has('billing') || cardSet.has('collections') || cardSet.has('profit')) ? (
        <section className="min-w-0 max-w-full">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
            {data.showBilling && cardSet.has('billing') ? (
              <KpiCard
                title={t('businessSummary.invoicedThisMonth')}
                money={data.organizationSummary.invoicedThisMonth}
                hint={tFinancial('basis.billingCash')}
              />
            ) : null}
            <KpiCard
              title={t('businessSummary.costsThisMonth')}
              money={data.organizationSummary.costsThisMonth}
              hint={tFinancial('basis.netExVat')}
            />
          </div>
        </section>
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

function KpiCard({
  title,
  money,
  value,
  hint,
  footer,
  unavailable,
  unavailableLabel,
  unavailableHint,
}: {
  title: string;
  money?: { amount: string; currency: string };
  value?: string;
  hint?: string;
  footer?: ReactNode;
  unavailable?: boolean;
  unavailableLabel?: string;
  unavailableHint?: string;
}) {
  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader className="pb-1">
        <CardTitle className="break-words text-xs font-medium text-[var(--pf-text-secondary)]">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-1">
        {unavailable ? (
          <>
            <span className="text-lg font-semibold text-[var(--pf-status-warning-fg,var(--pf-text-primary))]">
              {unavailableLabel}
            </span>
            {unavailableHint ? (
              <p className="break-words text-xs text-[var(--pf-text-secondary)]">
                {unavailableHint}
              </p>
            ) : null}
          </>
        ) : money ? (
          <div className="min-w-0 max-w-full overflow-x-auto">
            <MoneyText value={money} className="text-lg font-semibold" />
          </div>
        ) : (
          <span className="text-lg font-semibold">{value}</span>
        )}
        {hint ? (
          <p className="break-words text-xs text-[var(--pf-text-muted)]">{hint}</p>
        ) : null}
        {footer}
      </CardContent>
    </Card>
  );
}
