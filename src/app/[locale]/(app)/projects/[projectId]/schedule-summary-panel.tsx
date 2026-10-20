import { getTranslations } from 'next-intl/server';
import {
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
} from '@/components/patterns/main-app';
import type { ScheduleSummary } from '@/modules/projects';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { formatPercentDisplay } from '@/shared/number/display';

interface ScheduleSummaryPanelProps {
  summary: ScheduleSummary;
  projectId: string;
}

export async function ScheduleSummaryPanel({ summary, projectId }: ScheduleSummaryPanelProps) {
  const t = await getTranslations('projects.schedule');
  const tDetails = await getTranslations('projects.details');

  const hasSignal =
    summary.startDate ||
    summary.targetEndDate ||
    summary.progressPercent != null ||
    summary.milestoneCount > 0 ||
    summary.projectOverdue ||
    summary.overdueWorkPackageCount > 0;

  if (!hasSignal) {
    return (
      <MainAppSection title={t('title')} className="border-dashed">
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
        <Link
          href={`/projects/${projectId}?tab=details`}
          className={cn(textNavLinkClassName, 'inline-block text-sm')}
        >
          {t('addDates')}
        </Link>
      </MainAppSection>
    );
  }

  const dateRange = [summary.startDate, summary.targetEndDate].filter(Boolean).join(' → ') || '-';

  return (
    <MainAppSection
      title={t('title')}
      actions={
        summary.projectOverdue ? (
          <span className="text-sm font-medium text-[var(--pf-status-danger-fg)]">
            {t('projectOverdue')}
          </span>
        ) : undefined
      }
    >
      <MainAppSummaryGrid>
        <MainAppSummaryItem label={t('dates')}>
          <span className="tabular-nums" dir="ltr">
            {dateRange}
          </span>
        </MainAppSummaryItem>
        <MainAppSummaryItem label={tDetails('progressPercent')}>
          <span className="tabular-nums">
            {summary.progressPercent != null
              ? formatPercentDisplay(summary.progressPercent)
              : '-'}
            {summary.progressStatus
              ? ` · ${tDetails(`progressStatuses.${summary.progressStatus}`)}`
              : null}
          </span>
        </MainAppSummaryItem>
        <MainAppSummaryItem label={t('milestones')}>
          <span>
            {t('milestoneProgress', {
              achieved: summary.achievedMilestoneCount,
              total: summary.milestoneCount,
            })}
          </span>
          {summary.overdueMilestoneCount > 0 ? (
            <span className="mt-0.5 block font-normal text-[var(--pf-status-danger-fg)]">
              {t('overdueMilestones', { count: summary.overdueMilestoneCount })}
            </span>
          ) : null}
        </MainAppSummaryItem>
        <MainAppSummaryItem label={t('nextMilestone')}>
          {summary.nextMilestone ? (
            <>
              <span className="font-medium">{summary.nextMilestone.name}</span>
              <span className="mt-0.5 block font-normal text-[var(--pf-text-secondary)]">
                {summary.nextMilestone.targetDate ?? '-'}
                {summary.nextMilestone.overdue ? ` · ${t('overdue')}` : null}
              </span>
            </>
          ) : (
            <span className="font-normal text-[var(--pf-text-secondary)]">
              {t('noNextMilestone')}
            </span>
          )}
        </MainAppSummaryItem>
      </MainAppSummaryGrid>

      {summary.overdueWorkPackageCount > 0 ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]">
          {t('overdueWorkPackages', { count: summary.overdueWorkPackageCount })}
        </p>
      ) : null}
      {summary.overduePhaseCount > 0 ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]">
          {t('overduePhases', { count: summary.overduePhaseCount })}
        </p>
      ) : null}
    </MainAppSection>
  );
}
