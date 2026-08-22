import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buildTimeEntryDailySummaries } from '@/modules/workforce/application/time-entry-daily-summaries';
import { formatWorkHoursValue } from '@/modules/workforce/domain/format-work-hours';
import { listProjectTimeEntries } from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import { canLogTime, canViewWorkforceCosts } from './employees-table';
import { TimeEntriesTable } from './time-entries-table';

export interface ProjectTimePanelProps {
  readonly projectId: string;
}

/**
 * Project Time tab: logged hours only.
 * Team roster lives on the dedicated Team tab (assignment ≠ Actual).
 */
export async function ProjectTimePanel({ projectId }: ProjectTimePanelProps) {
  const t = await getTranslations('workforce');

  const data = await withOrgContext(async (context) => {
    if (
      !hasPermission(context, PERMISSIONS.WORKFORCE_READ) &&
      !hasPermission(context, PERMISSIONS.PROJECTS_READ)
    ) {
      return null;
    }

    const entries = await listProjectTimeEntries(context, projectId);
    const showCosts = canViewWorkforceCosts(context);
    const allowLog = canLogTime(context);
    const allowApprove = hasPermission(context, PERMISSIONS.TIME_APPROVE);
    const approvedEntries = entries.filter((entry) => entry.approvalStatus === 'approved');
    const pendingEntries = entries.filter(
      (entry) =>
        entry.approvalStatus === 'draft' ||
        entry.approvalStatus === 'submitted' ||
        entry.approvalStatus === 'returned',
    );
    const approvedHours = approvedEntries.reduce((sum, entry) => sum + Number(entry.hours), 0);
    const pendingHours = pendingEntries.reduce((sum, entry) => sum + Number(entry.hours), 0);
    const approvedWorkDays = new Set(approvedEntries.map((entry) => entry.workDate)).size;
    const pendingWorkDays = new Set(pendingEntries.map((entry) => entry.workDate)).size;
    const totalHours = entries.reduce((sum, entry) => sum + Number(entry.hours), 0);
    const dailySummaries = await buildTimeEntryDailySummaries(context, entries);

    return {
      entries,
      showCosts,
      allowLog,
      allowApprove,
      totalHours,
      approvedHours,
      pendingHours,
      approvedWorkDays,
      pendingWorkDays,
      dailySummaries,
      todayDate: todayInTimeZone(context.organization.timezone),
    };
  });

  if (!data) return null;

  const {
    entries,
    showCosts,
    allowLog,
    allowApprove,
    totalHours,
    approvedHours,
    pendingHours,
    approvedWorkDays,
    pendingWorkDays,
    dailySummaries,
    todayDate,
  } = data;
  const formattedTotal = formatWorkHoursValue(totalHours);
  const formattedApproved = formatWorkHoursValue(approvedHours);
  const formattedPending = formatWorkHoursValue(pendingHours);

  return (
    <div className="flex flex-col gap-4" data-pf-project-time-panel>
      <Card className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 text-start">
            <h2 className="text-lg font-semibold">{t('projectPanel.title')}</h2>
            <p className="text-sm text-[var(--pf-text-secondary)]">
              {t('projectPanel.summary', { hours: formattedTotal, count: entries.length })}
            </p>
            <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
              {t('projectPanel.approvedSummary', {
                hours: formattedApproved,
                days: approvedWorkDays,
              })}
            </p>
            {pendingHours > 0 ? (
              <p className="mt-1 text-sm text-[var(--pf-status-warning-fg)]">
                {t('projectPanel.pendingSummary', {
                  hours: formattedPending,
                  days: pendingWorkDays,
                })}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {allowApprove && pendingHours > 0 ? (
              <Button asChild size="sm" variant="secondary">
                <Link href="/workforce/time/approvals">{t('projectPanel.approvePending')}</Link>
              </Button>
            ) : null}
            {allowLog ? (
              <Button asChild size="sm" className="shrink-0">
                <Link href={`/workforce/time/new?projectId=${projectId}`}>
                  {t('projectPanel.logTime')}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <p className="text-start text-sm text-[var(--pf-text-muted)]">
          <Link href={`/projects/${projectId}?tab=team`} className="underline underline-offset-2">
            {t('projectPanel.teamTitle')}
          </Link>
          {' - '}
          {t('projectPanel.assignmentNote')}
        </p>

        <TimeEntriesTable
          entries={entries.slice(0, 10)}
          showCosts={showCosts}
          canLogTime={allowLog}
          dailySummaries={dailySummaries}
          projectScoped
          suppressEmptyCreate
          todayDate={todayDate}
        />

        {entries.length > 10 ? (
          <Button asChild variant="ghost" className="self-start">
            <Link href={`/workforce/time?projectId=${projectId}`}>{t('projectPanel.viewAll')}</Link>
          </Button>
        ) : null}
      </Card>
    </div>
  );
}
