import { Suspense, type ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import {
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
} from '@/components/patterns/main-app';
import { ProjectFinancialsSnapshotView } from '@/modules/financials/ui/project-financials-snapshot-view';
import type { ProjectFinancials } from '@/modules/financials/domain/types';
import { buildScheduleSummary, type ProjectDetail } from '@/modules/projects';
import {
  loadProjectProgressView,
  schedulePercentForReader,
} from '@/modules/projects/application/project-progress-mode';
import { todayInTimeZone } from '@/shared/dates/dates';
import { withOrgContext } from '@/shared/auth/session';
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

  const scheduleBase = isJob
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
  const progressView = scheduleBase
    ? await withOrgContext((context) =>
        loadProjectProgressView(context.db, context.organizationId, detail.project.id),
      )
    : null;
  const schedule = scheduleBase
    ? {
        ...scheduleBase,
        progressPercent: schedulePercentForReader(
          progressView?.source ?? detail.project.progressSource,
          scheduleBase.progressPercent,
          progressView?.displayedPercent ?? null,
        ),
      }
    : null;

  const dateRange =
    [detail.project.startDate, detail.project.targetEndDate].filter(Boolean).join(' → ') || '-';

  const financialSummary =
    financialSnapshotSlot ??
    (canReadFinancials && preloadedFinancials && financialSnapshotT ? (
      <MainAppSection title={t('financialSnapshot')}>
        <div className="flex min-w-0 flex-col gap-2 text-sm">
          <ProjectFinancialsSnapshotView
            financials={preloadedFinancials}
            canReadProfit={preloadedCanReadProfit}
            t={financialSnapshotT}
          />
        </div>
      </MainAppSection>
    ) : null);

  if (isJob) {
    return (
      <div className="flex w-full min-w-0 max-w-full flex-col gap-4">
        <MainAppSection
          title={tJobs('overview.datesTitle')}
          actions={
            <Link href={detailsHref} className={cn(textNavLinkClassName, 'text-sm')}>
              {tJobs('overview.editDates')}
            </Link>
          }
        >
          <MainAppSummaryGrid>
            <MainAppSummaryItem label={t('datesLabel')}>
              <span className="tabular-nums" dir="ltr">
                {dateRange}
              </span>
            </MainAppSummaryItem>
          </MainAppSummaryGrid>
        </MainAppSection>
        {financialSummary}
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-4">
      {canReadFinancials ? (
        <Suspense fallback={<ProjectEarlyWarningsFallback />}>
          <ProjectEarlyWarningsPanel projectId={detail.project.id} />
        </Suspense>
      ) : null}

      {schedule ? (
        <ScheduleSummaryPanel summary={schedule} projectId={detail.project.id} />
      ) : (
        <MainAppSection title={t('summaryTitle')}>
          <MainAppSummaryGrid>
            <MainAppSummaryItem label={t('datesLabel')}>
              <span className="tabular-nums" dir="ltr">
                {dateRange}
              </span>
            </MainAppSummaryItem>
          </MainAppSummaryGrid>
        </MainAppSection>
      )}

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
