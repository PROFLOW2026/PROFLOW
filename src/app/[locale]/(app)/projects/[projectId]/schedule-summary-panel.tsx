import { getTranslations } from 'next-intl/server';
import type { ScheduleSummary } from '@/modules/projects';
import { Link } from '@/shared/i18n/navigation';

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
      <section className="rounded-lg border border-dashed border-[var(--pf-border-default)] p-4">
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
        <Link
          href={`/projects/${projectId}?tab=details`}
          className="mt-2 inline-block text-sm hover:underline"
        >
          {t('addDates')}
        </Link>
      </section>
    );
  }

  const dateRange = [summary.startDate, summary.targetEndDate].filter(Boolean).join(' → ') || '—';

  return (
    <section className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        {summary.projectOverdue ? (
          <span className="text-sm font-medium text-[var(--pf-status-danger-fg)]">{t('projectOverdue')}</span>
        ) : null}
      </div>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
            {t('dates')}
          </dt>
          <dd className="mt-1 text-sm tabular-nums">{dateRange}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
            {tDetails('progressPercent')}
          </dt>
          <dd className="mt-1 text-sm tabular-nums">
            {summary.progressPercent != null ? `${summary.progressPercent}%` : '—'}
            {summary.progressStatus
              ? ` · ${tDetails(`progressStatuses.${summary.progressStatus}`)}`
              : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
            {t('milestones')}
          </dt>
          <dd className="mt-1 text-sm">
            {t('milestoneProgress', {
              achieved: summary.achievedMilestoneCount,
              total: summary.milestoneCount,
            })}
            {summary.overdueMilestoneCount > 0 ? (
              <span className="mt-0.5 block text-[var(--pf-status-danger-fg)]">
                {t('overdueMilestones', { count: summary.overdueMilestoneCount })}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
            {t('nextMilestone')}
          </dt>
          <dd className="mt-1 text-sm">
            {summary.nextMilestone ? (
              <>
                <span className="font-medium">{summary.nextMilestone.name}</span>
                <span className="mt-0.5 block text-[var(--pf-text-secondary)]">
                  {summary.nextMilestone.targetDate ?? '—'}
                  {summary.nextMilestone.overdue ? ` · ${t('overdue')}` : null}
                </span>
              </>
            ) : (
              <span className="text-[var(--pf-text-secondary)]">{t('noNextMilestone')}</span>
            )}
          </dd>
        </div>
      </dl>

      {summary.overdueWorkPackageCount > 0 ? (
        <p className="mt-3 text-sm text-[var(--pf-status-danger-fg)]">
          {t('overdueWorkPackages', { count: summary.overdueWorkPackageCount })}
        </p>
      ) : null}
      {summary.overduePhaseCount > 0 ? (
        <p className="mt-1 text-sm text-[var(--pf-status-danger-fg)]">
          {t('overduePhases', { count: summary.overduePhaseCount })}
        </p>
      ) : null}
    </section>
  );
}
