import { Suspense, type ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectFinancialsSnapshotView } from '@/modules/financials/ui/project-financials-snapshot-view';
import type { ProjectFinancials } from '@/modules/financials/domain/types';
import { buildScheduleSummary, type ProjectDetail } from '@/modules/projects';
import { todayInTimeZone } from '@/shared/dates/dates';
import { Link } from '@/shared/i18n/navigation';
import { ProjectEarlyWarningsPanel, ProjectEarlyWarningsFallback } from './overview-early-warnings';
import { ScheduleSummaryPanel } from './schedule-summary-panel';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

interface OverviewTabProps {
  detail: ProjectDetail;
  locale: string;
  canReadFinancials: boolean;
  canEdit: boolean;
  workspaceLinks?: readonly unknown[];
  organizationTimezone: string;
  workKind?: 'project' | 'job';
  scheduleSlot?: ReactNode;
  milestonesSlot?: ReactNode;
  /** Streams in Suspense — overview shell must not block on full financial compose. */
  financialSnapshotSlot?: ReactNode;
  /** @deprecated Prefer financialSnapshotSlot */
  preloadedFinancials?: ProjectFinancials | null;
  preloadedCanReadProfit?: boolean;
  financialSnapshotT?: (key: string) => string;
}

export async function OverviewTab({
  detail,
  canReadFinancials,
  organizationTimezone,
  workKind = 'project',
  financialSnapshotSlot,
  preloadedFinancials,
  preloadedCanReadProfit = false,
  financialSnapshotT,
}: OverviewTabProps) {
  const t = await getTranslations('projects.overview');
  const tJobs = await getTranslations('jobs');
  const isJob = workKind === 'job' || detail.project.workKind === 'job';
  const detailsHref = isJob
    ? `/jobs/${detail.project.id}?tab=details`
    : `/projects/${detail.project.id}?tab=details`;
  const moneyHref = `/projects/${detail.project.id}?tab=financials`;

  const schedule = isJob
    ? null
    : buildScheduleSummary({
        project: detail.project,
        workPackages: detail.workPackages,
        milestones: detail.milestones,
        phases: detail.phases,
        today: (() => {
          try {
            return todayInTimeZone(organizationTimezone);
          } catch {
            return todayInTimeZone('Asia/Jerusalem');
          }
        })(),
      });

  const dateRange =
    [detail.project.startDate, detail.project.targetEndDate].filter(Boolean).join(' → ') || '-';

  const financialSummary =
    financialSnapshotSlot ??
    (canReadFinancials && preloadedFinancials && financialSnapshotT ? (
      <Card className="min-w-0 max-w-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('financialSnapshot')}</CardTitle>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-2 text-sm">
          <ProjectFinancialsSnapshotView
            financials={preloadedFinancials}
            canReadProfit={preloadedCanReadProfit}
            t={financialSnapshotT}
          />
        </CardContent>
      </Card>
    ) : null);

  if (isJob) {
    return (
      <div className="flex min-w-0 max-w-full flex-col gap-4">
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
        {financialSummary}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4">
      {canReadFinancials ? (
        <Suspense fallback={<ProjectEarlyWarningsFallback />}>
          <ProjectEarlyWarningsPanel projectId={detail.project.id} />
        </Suspense>
      ) : null}

      <section className="grid min-w-0 grid-cols-1 gap-4">
        {schedule ? (
          <ScheduleSummaryPanel summary={schedule} projectId={detail.project.id} />
        ) : (
          <Card className="min-w-0 max-w-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('summaryTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="flex min-w-0 justify-between gap-2">
                <span className="text-[var(--pf-text-secondary)]">{t('datesLabel')}</span>
                <span className="min-w-0 text-end tabular-nums" dir="ltr">
                  {dateRange}
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {financialSummary}

      {canReadFinancials ? (
        <p className="text-sm">
          <Link href={moneyHref} className={textNavLinkClassName} prefetch={false}>
            {t('openFinancialsHub')}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
