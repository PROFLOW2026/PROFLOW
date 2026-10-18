import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { Link } from '@/shared/i18n/navigation';
import {
  canManageProjectAccess,
  getProjectAccessModeForOrg,
  listProjectAccessGrantsForOrg,
} from '@/modules/projects';
import { loadUnifiedProjectTeam } from '@/modules/projects/application/unified-project-team';
import { ProjectScopedAccessPanel } from '@/modules/projects/ui/project-scoped-access-panel';
import { ProjectUnifiedTeamSummary } from '@/modules/projects/ui/project-unified-team-summary';
import { listOrganizationMembers } from '@/modules/tenancy';
import {
  listEmployeesForOrg,
  listProjectTeamHistory,
  listProjectTeamMembers,
} from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { mapEmployeeAvatarKeys, resolveIdentityImageUrls } from '@/modules/identity-images';
import { canManageWorkforce } from './employees-table';
import { ProjectLaborActualSummary } from './project-labor-actual-summary';
import { ProjectTeamRoster } from './project-team-roster';

export interface ProjectTeamPanelProps {
  readonly projectId: string;
}

/**
 * Project → צוות tab: assignment roster + optional project access grants.
 * Assignment ≠ labor Actual - adding a member never creates cost.
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

    const canWorkforceRead = hasPermission(context, PERMISSIONS.WORKFORCE_READ);
    const canProjectsRead = hasPermission(context, PERMISSIONS.PROJECTS_READ);
    const allowManage = canManageWorkforce(context);
    const allowAccessManage = canManageProjectAccess(context);
    const unifiedTeam = await loadUnifiedProjectTeam(context, projectId);
    const [team, history, employees, accessMode, grants, members] = await Promise.all([
      canWorkforceRead ? listProjectTeamMembers(context, projectId) : Promise.resolve([]),
      listProjectTeamHistory(context, projectId).catch(() => []),
      allowManage ? listEmployeesForOrg(context, { status: 'active' }) : Promise.resolve([]),
      getProjectAccessModeForOrg(context).catch(() => 'all' as const),
      listProjectAccessGrantsForOrg(context, projectId).catch(() => []),
      allowAccessManage || hasPermission(context, PERMISSIONS.MEMBERS_READ)
        ? listOrganizationMembers(context)
            .then((rows) => rows.filter((member) => member.status === 'active'))
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    const teamIds = [
      ...new Set([
        ...team.map((member) => member.employeeId),
        ...history.map((member) => member.employeeId),
      ]),
    ];
    const avatarKeys = await mapEmployeeAvatarKeys(context.db, context.organizationId, teamIds);
    const avatarUrls = await resolveIdentityImageUrls(avatarKeys);

    return {
      unifiedTeam,
      canWorkforceRead,
      canProjectsRead,
      team: team.map((member) => ({
        ...member,
        avatarUrl: avatarUrls.get(member.employeeId) ?? null,
      })),
      history: history.map((member) => ({
        ...member,
        avatarUrl: avatarUrls.get(member.employeeId) ?? null,
      })),
      candidateEmployees: employees.map((employee) => ({
        id: employee.id,
        name: employee.name,
        jobTitle: employee.jobTitle,
      })),
      allowManage,
      allowAccessManage,
      accessMode,
      grants,
      members: members.map((member) => ({
        userId: member.userId,
        email: member.email,
        displayName: member.displayName,
      })),
      defaultStartDate: todayInTimeZone(context.organization.timezone),
    };
  });

  if (!data) return null;

  return (
    <div className="flex flex-col gap-4">
      <ProjectUnifiedTeamSummary
        projectId={projectId}
        members={data.unifiedTeam}
        canManageRoster={data.allowManage}
        canOpenCapabilities={data.canProjectsRead}
      />
      {data.canWorkforceRead ? (
        <Card className="flex flex-col gap-4 p-4 sm:p-6">
          <ProjectTeamRoster
            projectId={projectId}
            team={data.team}
            history={data.history}
            candidateEmployees={data.candidateEmployees}
            canManage={data.allowManage}
            defaultStartDate={data.defaultStartDate}
          />
          <ProjectLaborActualSummary projectId={projectId} surface="team" />
        </Card>
      ) : null}
      <p className="text-start text-sm text-[var(--pf-text-muted)]">{t('projectPanel.assignmentNote')}</p>
      <Link
        href={`/projects/${projectId}/team`}
        className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--pf-text-brand)] hover:underline"
      >
        {t('projectPanel.capabilityTeamLink')}
      </Link>

      {(data.allowAccessManage || data.grants.length > 0 || data.accessMode !== 'all') && (
        <WithAppClientMessages extra={['settings']}>
          <ProjectScopedAccessPanel
            projectId={projectId}
            mode={data.accessMode}
            canManage={data.allowAccessManage}
            members={data.members}
            grants={data.grants}
          />
        </WithAppClientMessages>
      )}
    </div>
  );
}
