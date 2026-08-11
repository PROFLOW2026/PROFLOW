import { Suspense, type ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SkeletonText } from '@/components/ui/skeleton';
import { ProjectFinancialsSnapshot } from '@/modules/financials/ui/project-financials-snapshot';
import {
  buildScheduleSummary,
  computeApprovedChangesTotal,
  findOriginalValueEvent,
  hasStoredOpeningReduction,
  resolveDisplayOriginalNet,
  resolveOpeningReductionNet,
  type ProjectDetail,
  type ProjectWorkspaceLink,
} from '@/modules/projects';
import { todayInTimeZone } from '@/shared/dates/dates';
import { Link } from '@/shared/i18n/navigation';
import { MilestonesPanel } from './milestones-panel';
import { OverviewContractHistorySuspense } from './overview-contract-history';
import { ProjectWorkspaceNav } from './project-workspace-nav';
import { ScheduleSummaryPanel } from './schedule-summary-panel';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

interface OverviewTabProps {
  detail: ProjectDetail;
  locale: string;
  canReadFinancials: boolean;
  canEdit: boolean;
  workspaceLinks: readonly ProjectWorkspaceLink[];
  organizationTimezone: string;
  /** Jobs get a slim overview (dates + money links) without schedule/milestones chrome. */
  workKind?: 'project' | 'job';
  /**
   * When set, schedule / milestones render from these slots (own Suspense +
   * cached structure fetch) so contract cards are not blocked on WP rows.
   */
  scheduleSlot?: ReactNode;
  milestonesSlot?: ReactNode;
}

export async function OverviewTab({
  detail,
  locale,
  canReadFinancials,
  canEdit,
  workspaceLinks,
  organizationTimezone,
  workKind = 'project',
  scheduleSlot,
  milestonesSlot,
}: OverviewTabProps) {
  const t = await getTranslations('projects.overview');
  const tJobs = await getTranslations('jobs');
  const isJob = workKind === 'job' || detail.project.workKind === 'job';
  const detailsHref = isJob
    ? `/jobs/${detail.project.id}?tab=details`
    : `/projects/${detail.project.id}?tab=details`;

  const schedule =
    isJob || scheduleSlot
      ? null
      : buildScheduleSummary({
          project: detail.project,
          workPackages: detail.workPackages,
          milestones: detail.milestones,
          phases: detail.phases,
          today: todayInTimeZone(organizationTimezone),
        });

  const originalEvent = detail.contract
    ? findOriginalValueEvent(detail.contractValueEvents)
    : null;

  const approvedChanges =
    detail.contract && detail.currentContractValue
      ? computeApprovedChangesTotal(detail.contractValueEvents, detail.contract.currency)
      : null;

  const currency = detail.contract?.currency ?? detail.currentContractValue?.currency ?? 'ILS';
  const showEntryBaseline =
    Boolean(detail.contract) && hasStoredOpeningReduction(detail.contract!);
  const displayOriginalNet = detail.contract ? resolveDisplayOriginalNet(detail.contract) : null;
  const openingReductionNet = detail.contract ? resolveOpeningReductionNet(detail.contract) : null;

  const dateRange =
    [detail.project.startDate, detail.project.targetEndDate].filter(Boolean).join(' → ') || '—';

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4">
      <ProjectWorkspaceNav links={workspaceLinks} />

      {isJob ? (
        <section className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-sm font-semibold">{tJobs('overview.datesTitle')}</h2>
            <Link href={detailsHref} className={cn(textNavLinkClassName, 'text-sm')}>
              {tJobs('overview.editDates')}
            </Link>
          </div>
          <p className="mt-2 text-sm tabular-nums" dir="ltr">
            {dateRange}
          </p>
        </section>
      ) : scheduleSlot ? (
        scheduleSlot
      ) : schedule ? (
        <ScheduleSummaryPanel summary={schedule} projectId={detail.project.id} />
      ) : null}

      <section className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="min-w-0 max-w-full">
          <CardHeader>
            <CardTitle>{isJob ? tJobs('overview.priceSummary') : t('contractSummary')}</CardTitle>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-2 text-sm">
            {canReadFinancials && detail.currentContractValue ? (
              <>
                {!isJob && showEntryBaseline && displayOriginalNet ? (
                  <div className="flex min-w-0 justify-between gap-2">
                    <span className="min-w-0 break-words text-[var(--pf-text-secondary)]">
                      {t('displayOriginalValue')}
                    </span>
                    <span className="min-w-0 max-w-[55%] overflow-x-auto text-end">
                      <MoneyText value={displayOriginalNet} />
                    </span>
                  </div>
                ) : null}
                {!isJob && showEntryBaseline && openingReductionNet ? (
                  <div className="flex min-w-0 justify-between gap-2">
                    <span className="min-w-0 break-words text-[var(--pf-text-secondary)]">
                      {t('openingReductionValue')}
                    </span>
                    <span className="min-w-0 max-w-[55%] overflow-x-auto text-end">
                      <MoneyText value={openingReductionNet} />
                    </span>
                  </div>
                ) : null}
                {!isJob && originalEvent ? (
                  <div className="flex min-w-0 justify-between gap-2">
                    <span className="min-w-0 break-words text-[var(--pf-text-secondary)]">
                      {t('originalValue')}
                    </span>
                    <span className="min-w-0 max-w-[55%] overflow-x-auto text-end">
                      <MoneyText
                        value={{
                          amount: originalEvent.amount,
                          currency: originalEvent.currency,
                        }}
                      />
                    </span>
                  </div>
                ) : null}
                {!isJob && approvedChanges ? (
                  <div className="flex min-w-0 justify-between gap-2">
                    <span className="min-w-0 break-words text-[var(--pf-text-secondary)]">
                      {t('approvedChanges')}
                    </span>
                    <span className="min-w-0 max-w-[55%] overflow-x-auto text-end">
                      <MoneyText value={approvedChanges} />
                    </span>
                  </div>
                ) : null}
                <div className="flex min-w-0 justify-between gap-2 font-medium">
                  <span className="min-w-0 break-words">
                    {isJob ? tJobs('pricing.priceLabel') : t('currentValue')}
                  </span>
                  <span className="min-w-0 max-w-[55%] overflow-x-auto text-end">
                    <MoneyText value={detail.currentContractValue} />
                  </span>
                </div>
              </>
            ) : (
              <>
                <p>{isJob ? tJobs('pricing.priceNotSet') : t('noContractYet')}</p>
                <CardDescription>
                  {isJob ? tJobs('overview.noPriceHint') : t('noContractHint')}
                </CardDescription>
              </>
            )}
          </CardContent>
        </Card>

        {canReadFinancials ? (
          <Card className="min-w-0 max-w-full">
            <CardHeader>
              <CardTitle>{t('financialSnapshot')}</CardTitle>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-2 text-sm">
              <Suspense fallback={<SkeletonText lines={3} />}>
                <ProjectFinancialsSnapshot projectId={detail.project.id} />
              </Suspense>
            </CardContent>
          </Card>
        ) : null}
      </section>

      {!isJob
        ? (milestonesSlot ?? (
            <MilestonesPanel
              projectId={detail.project.id}
              milestones={detail.milestones.map((row) => ({
                id: row.id,
                name: row.name,
                targetDate: row.targetDate,
                status: row.status,
                archivedAt: row.archivedAt,
              }))}
              canEdit={canEdit}
              today={todayInTimeZone(organizationTimezone)}
            />
          ))
        : null}

      {canReadFinancials && !isJob ? (
        <OverviewContractHistorySuspense
          projectId={detail.project.id}
          locale={locale}
          currency={currency}
        />
      ) : null}
    </div>
  );
}
