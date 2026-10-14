import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listProjectMembers } from '@/modules/project-team';
import { listProjectAccessGrantsForOrg } from '@/modules/projects/application/project-access';
import { listOrganizationMembers } from '@/modules/tenancy';
import { listProjectTeamMembers } from '@/modules/workforce/application/project-team';
import {
  mergeProjectTeamSources,
  type UnifiedProjectTeamMember,
  type UnifiedProjectTeamSources,
} from '../domain/unified-project-team';

export async function loadUnifiedProjectTeamSources(
  context: OrgContext,
  projectId: string,
): Promise<UnifiedProjectTeamSources> {
  const roster = hasPermission(context, PERMISSIONS.WORKFORCE_READ)
    ? (await listProjectTeamMembers(context, projectId)).map((row) => ({
        employeeId: row.employeeId,
        displayName: row.employeeName,
        jobTitle: row.jobTitle,
      }))
    : [];

  const capabilities = hasPermission(context, PERMISSIONS.PROJECTS_READ)
    ? (
        await listProjectMembers(context.db, context.organizationId, projectId)
      )
        .filter((member) => member.status === 'active')
        .map((row) => ({
          userId: row.userId,
          displayName: row.displayName ?? row.email,
          email: row.email,
        }))
    : [];

  let access: UnifiedProjectTeamSources['access'] = [];
  if (
    hasPermission(context, PERMISSIONS.PROJECTS_READ) ||
    hasPermission(context, PERMISSIONS.MEMBERS_READ)
  ) {
    const [grants, orgMembers] = await Promise.all([
      listProjectAccessGrantsForOrg(context, projectId),
      hasPermission(context, PERMISSIONS.MEMBERS_READ)
        ? listOrganizationMembers(context)
        : Promise.resolve([]),
    ]);
    const labels = new Map(
      orgMembers.map((member) => [
        member.userId,
        { displayName: member.displayName ?? member.email, email: member.email ?? null },
      ]),
    );
    access = grants.map((grant) => {
      const label = labels.get(grant.userId);
      return {
        userId: grant.userId,
        displayName: label?.displayName ?? grant.userId,
        email: label?.email ?? null,
      };
    });
  }

  return { roster, capabilities, access };
}

export async function loadUnifiedProjectTeam(
  context: OrgContext,
  projectId: string,
): Promise<readonly UnifiedProjectTeamMember[]> {
  const sources = await loadUnifiedProjectTeamSources(context, projectId);
  return mergeProjectTeamSources(sources);
}

export { unifiedTeamHasMembers } from '../domain/unified-project-team';
