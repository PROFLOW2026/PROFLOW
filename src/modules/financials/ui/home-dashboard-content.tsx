import { AlertCircle, FolderKanban, Plus, Receipt } from 'lucide-react';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { CoverageDisclosure } from '@/components/patterns/coverage-disclosure';
import { MoneyText } from '@/components/patterns/money-text';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PrefetchOnIntentLink } from '@/components/ui/prefetch-on-intent-link';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import type { HomeDashboardData } from '../application/get-home-dashboard';
import type { DataConfidenceLevel, DataConfidenceReason } from '../domain/data-confidence';
import { mapCoverageToSources, partialNote, standalonePartialNotes } from './map-coverage-sources';
import { DataConfidenceBadge } from './data-confidence-badge';

interface HomeDashboardContentProps {
  data: HomeDashboardData;
}

export async function HomeDashboardContent({ data }: HomeDashboardContentProps) {
  const t = await getTranslations('dashboard');
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

  const coverageSources = data.profitCoverage
    ? mapCoverageToSources(data.profitCoverage, tFinancial)
    : [];
  const costCoverageSources = data.costCoverage
    ? mapCoverageToSources(data.costCoverage, tFinancial)
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

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      {(data.totalContractValue ||
        data.totalActualCost ||
        data.estimatedProfit ||
        data.forecast ||
        data.showBilling) && (
        <section className="min-w-0 max-w-full">
          <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--pf-text-secondary)]">
              {t('businessSummary.title')}
            </h2>
            {data.dataConfidence ? (
              <DataConfidenceBadge
                level={data.dataConfidence.level as DataConfidenceLevel}
                label={tFinancial(`confidence.levels.${data.dataConfidence.level}`)}
                title={
                  data.dataConfidence.reasons.length === 0
                    ? tFinancial('confidence.highHint')
                    : data.dataConfidence.reasons
                        .map((reason) =>
                          tFinancial(`confidence.reasons.${reason as DataConfidenceReason}`),
                        )
                        .join(' · ')
                }
              />
            ) : null}
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.activeProjectCount > 0 ? (
              <KpiCard title={t('activeProjects')} value={String(data.activeProjectCount)} />
            ) : null}
            {data.totalContractValue ? (
              <KpiCard
                title={tFinancial('kpis.currentContract')}
                money={data.totalContractValue}
                hint={tFinancial('basis.netExVat')}
                footer={
                  contractValueNote ? (
                    <p className="break-words text-xs text-[var(--pf-text-secondary)]">{contractValueNote}</p>
                  ) : null
                }
              />
            ) : null}
            {data.totalActualCost ? (
              <KpiCard
                title={tFinancial('kpis.actualCost')}
                money={data.totalActualCost}
                hint={tFinancial('basis.netExVat')}
                footer={
                  data.costCoverage ? (
                    <CoverageDisclosure sources={costCoverageSources} />
                  ) : null
                }
              />
            ) : null}
            {data.showProfit && data.estimatedProfit ? (
              <KpiCard
                title={tFinancial('kpis.forecastMargin')}
                money={data.estimatedProfit}
                hint={tFinancial('basis.profitNet')}
                footer={<CoverageDisclosure sources={coverageSources} />}
              />
            ) : null}
          </div>

          {data.forecast ? (
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title={tFinancial('kpis.allocatedOverhead')}
                money={data.forecast.totalAllocatedOverhead}
              />
              <KpiCard
                title={tFinancial('kpis.committed')}
                money={data.forecast.totalRemainingCommitments}
              />
              <KpiCard
                title={tFinancial('kpis.expectedRemaining')}
                money={data.forecast.totalExpectedRemaining}
              />
              <KpiCard
                title={tFinancial('kpis.forecast')}
                money={data.forecast.totalForecastFinalCost}
                hint={tFinancial('basis.netExVat')}
              />
              {data.showProfit && data.forecast.totalActualMargin ? (
                <KpiCard
                  title={tFinancial('kpis.actualMargin')}
                  money={data.forecast.totalActualMargin}
                  hint={tFinancial('basis.profitNet')}
                />
              ) : null}
              {data.showProfit && data.forecast.totalForecastMargin ? (
                <KpiCard
                  title={tFinancial('kpis.forecastMargin')}
                  money={data.forecast.totalForecastMargin}
                  hint={tFinancial('basis.profitNet')}
                />
              ) : null}
              <KpiCard
                title={tFinancial('unallocatedBusinessCosts')}
                money={data.forecast.unallocatedBusinessCosts}
                footer={
                  <p className="break-words text-xs text-[var(--pf-text-secondary)]">
                    {tFinancial('unallocatedBusinessCostsHint')}
                  </p>
                }
              />
            </div>
          ) : null}

          {data.showBilling && data.billing ? (
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
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
              <KpiCard
                title={tFinancial('kpis.outstanding')}
                money={data.billing.outstanding}
                hint={tFinancial('basis.outstandingCash')}
              />
            </div>
          ) : null}
        </section>
      )}

      {data.organizationSummary ? (
        <section className="min-w-0 max-w-full">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
            {data.showBilling ? (
              <KpiCard
                title={t('businessSummary.outstanding')}
                money={data.organizationSummary.outstanding}
                hint={tFinancial('basis.outstandingCash')}
              />
            ) : null}
            {data.showBilling ? (
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

      {hasAttention ? (
        <section className="min-w-0 max-w-full">
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
      ) : null}

      {data.recentProjects.length > 0 ? (
        <section className="min-w-0 max-w-full">
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
        </section>
      ) : null}

      {(data.canCreateProject || data.canCreateExpense) && (
        <section className="min-w-0 max-w-full">
          <h2 className="mb-3 text-sm font-semibold">{t('quickActions')}</h2>
          <div className="flex min-w-0 max-w-full flex-wrap gap-2">
            {data.canCreateProject ? (
              <Button asChild size="sm" variant="secondary">
                <Link href="/projects/new" prefetch={false}>
                  {tNav('newMenu.project')}
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
      )}
    </div>
  );
}

function KpiCard({
  title,
  money,
  value,
  hint,
  footer,
}: {
  title: string;
  money?: { amount: string; currency: string };
  value?: string;
  hint?: string;
  footer?: ReactNode;
}) {
  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader className="pb-1">
        <CardTitle className="break-words text-xs font-medium text-[var(--pf-text-secondary)]">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-1">
        {money ? (
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
