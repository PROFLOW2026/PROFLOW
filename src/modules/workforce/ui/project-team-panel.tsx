import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import {
  listEmployeesForOrg,
  listProjectTeamHistory,
  listProjectTeamMembers,
} from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { canManageWorkforce } from './employees-table';
import { ProjectTeamRoster } from './project-team-roster';

export interface ProjectTeamPanelProps {
  readonly projectId: string;
}

/**
 * Project → צוות tab: assignment roster only.
 * Assignment ≠ labor Actual — adding a member never creates cost.
 */
export async function ProjectTeamPanel({ projectId }: ProjectTeamPanelProps) {
  const t = await getTranslations('workforce');

  const data = await withOrgContext(async (context) => {
    if (
      !hasPermission(context, PERMISSIONS.WORKFORCE_READ) &&
      !hasPermission(context, PERMISSIONS.PROJECTS_READ)
    ) {
      return null;
    }

    const allowManage = canManageWorkforce(context);
    const [team, history, employees] = await Promise.all([
      listProjectTeamMembers(context, projectId),
      listProjectTeamHistory(context, projectId).catch(() => []),
      allowManage ? listEmployeesForOrg(context, { status: 'active' }) : Promise.resolve([]),
    ]);

    return {
      team,
      history,
      candidateEmployees: employees.map((employee) => ({
        id: employee.id,
        name: employee.name,
        jobTitle: employee.jobTitle,
      })),
      allowManage,
      defaultStartDate: todayInTimeZone(context.organization.timezone),
    };
  });

  if (!data) return null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4 sm:p-6">
        <ProjectTeamRoster
          projectId={projectId}
          team={data.team}
          history={data.history}
          candidateEmployees={data.candidateEmployees}
          canManage={data.allowManage}
          defaultStartDate={data.defaultStartDate}
        />
      </Card>
      <p className="text-start text-sm text-[var(--pf-text-muted)]">{t('projectPanel.assignmentNote')}</p>
    </div>
  );
}
