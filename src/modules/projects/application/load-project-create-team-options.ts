import 'server-only';

import { listOrganizationMembers } from '@/modules/tenancy';
import { listActiveEmployeesForProjectCreateTeam } from '@/modules/workforce';
import {
  employeeHasPermission,
  isEmployeeAppUser,
} from '@/modules/employee-app/application/load-employee-app-context';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ProjectCreateTeamPickerOption } from '../domain/project-create-team';
import { canManageProjectAccess } from './project-access';

export type { ProjectCreateTeamPickerOption } from '../domain/project-create-team';

/** Create-time team picker — gated by projects.create, not workforce.manage. */
export function canManageProjectTeamAtCreate(context: OrgContext): boolean {
  if (isEmployeeAppUser(context)) {
    return employeeHasPermission(context, PERMISSIONS.PROJECTS_CREATE);
  }
  return hasPermission(context, PERMISSIONS.PROJECTS_CREATE);
}

export interface ProjectCreateTeamEmployeeCandidate {
  readonly key: string;
  readonly displayName: string;
  readonly jobTitle: string | null;
}

/**
 * Active employees for project-create team pickers — name and job title only.
 * Does not require workforce.read and never loads compensation fields.
 */
export async function loadProjectCreateTeamCandidatesSafe(
  context: OrgContext,
): Promise<ProjectCreateTeamEmployeeCandidate[]> {
  const rows = await listActiveEmployeesForProjectCreateTeam(
    context.db,
    context.organizationId,
  ).catch(() => []);

  return rows.map((row) => ({
    key: `e:${row.id}`,
    displayName: row.name,
    jobTitle: row.jobTitle,
  }));
}

export async function loadProjectCreateTeamPickerOptions(
  context: OrgContext,
): Promise<ProjectCreateTeamPickerOption[]> {
  if (!canManageProjectTeamAtCreate(context)) return [];

  const options: ProjectCreateTeamPickerOption[] = [];

  const employees = await loadProjectCreateTeamCandidatesSafe(context);
  for (const employee of employees) {
    options.push({
      key: employee.key,
      displayName: employee.displayName,
      jobTitle: employee.jobTitle,
      kind: 'employee',
    });
  }

  if (
    canManageProjectAccess(context) &&
    (hasPermission(context, PERMISSIONS.MEMBERS_READ) ||
      (isEmployeeAppUser(context) && employeeHasPermission(context, PERMISSIONS.MEMBERS_READ)))
  ) {
    const members = await listOrganizationMembers(context).catch(() => []);
    for (const member of members.filter((row) => row.status === 'active')) {
      options.push({
        key: `m:${member.membershipId}`,
        displayName: member.displayName ?? member.email,
        jobTitle: null,
        kind: 'org_member',
      });
    }
  }

  return options.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
  );
}
