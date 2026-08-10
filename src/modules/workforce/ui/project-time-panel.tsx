import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  listEmployeesForOrg,
  listProjectTeamHistory,
  listProjectTeamMembers,
  listProjectTimeEntries,
} from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { canLogTime, canManageWorkforce, canViewWorkforceCosts } from './employees-table';
import { ProjectTeamRoster } from './project-team-roster';
import { TimeEntriesTable } from './time-entries-table';

export interface ProjectTimePanelProps {
  readonly projectId: string;
}

/**
 * Project Time & team tab: formal `employee_project_assignments` roster + time entries.
 * Assignment ≠ labor Actual — adding a member never creates cost.
 */
export async function ProjectTimePanel({ projectId }: ProjectTimePanelProps) {
  const t = await getTranslations('workforce');

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.WORKFORCE_READ) && !hasPermission(context, PERMISSIONS.PROJECTS_READ)) {
      return null;
    }

    const allowManage = canManageWorkforce(context);
    const [entries, team, history, employees] = await Promise.all([
      listProjectTimeEntries(context, projectId),
      listProjectTeamMembers(context, projectId),
      listProjectTeamHistory(context, projectId).catch(() => []),
      allowManage ? listEmployeesForOrg(context, { status: 'active' }) : Promise.resolve([]),
    ]);
    const showCosts = canViewWorkforceCosts(context);
    const allowLog = canLogTime(context);

    const totalHours = entries.reduce((sum, entry) => sum + Number(entry.hours), 0);

    return {
      entries,
      team,
      history,
      candidateEmployees: employees.map((employee) => ({
        id: employee.id,
        name: employee.name,
        jobTitle: employee.jobTitle,
      })),
      showCosts,
      allowLog,
      allowManage,
      totalHours,
      defaultStartDate: todayInTimeZone(context.organization.timezone),
    };
  });

  if (!data) return null;

  const {
    entries,
    team,
    history,
    candidateEmployees,
    showCosts,
    allowLog,
    allowManage,
    totalHours,
    defaultStartDate,
  } = data;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4 sm:p-6">
        <ProjectTeamRoster
          projectId={projectId}
          team={team}
          history={history}
          candidateEmployees={candidateEmployees}
          canManage={allowManage}
          defaultStartDate={defaultStartDate}
        />
      </Card>

      <Card className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 text-start">
            <h2 className="text-lg font-semibold">{t('projectPanel.title')}</h2>
            <p className="text-sm text-[var(--pf-text-secondary)]">
              {t('projectPanel.summary', { hours: totalHours.toFixed(2), count: entries.length })}
            </p>
          </div>
          {allowLog ? (
            <Button asChild size="sm" className="shrink-0">
              <Link href={`/workforce/time/new?projectId=${projectId}`}>{t('projectPanel.logTime')}</Link>
            </Button>
          ) : null}
        </div>

        <TimeEntriesTable entries={entries.slice(0, 10)} showCosts={showCosts} canLogTime={allowLog} />

        {entries.length > 10 ? (
          <Button asChild variant="ghost" className="self-start">
            <Link href={`/workforce/time?projectId=${projectId}`}>{t('projectPanel.viewAll')}</Link>
          </Button>
        ) : null}
      </Card>
    </div>
  );
}
