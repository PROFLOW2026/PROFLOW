import 'server-only';

import { listOrganizationMembers } from '@/modules/tenancy';
import { listEmployeesForOrg } from '@/modules/workforce';
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

/** Same gate as post-create project team panel roster management. */
export function canManageProjectTeamAtCreate(context: OrgContext): boolean {
  if (isEmployeeAppUser(context)) {
    return employeeHasPermission(context, PERMISSIONS.WORKFORCE_MANAGE);
  }
  return hasPermission(context, PERMISSIONS.WORKFORCE_MANAGE);
}

export async function loadProjectCreateTeamPickerOptions(
  context: OrgContext,
): Promise<ProjectCreateTeamPickerOption[]> {
  if (!canManageProjectTeamAtCreate(context)) return [];

  const options: ProjectCreateTeamPickerOption[] = [];

  const employees = await listEmployeesForOrg(context, { status: 'active' }).catch(() => []);
  for (const employee of employees) {
    options.push({
      key: `e:${employee.id}`,
      displayName: employee.name,
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
