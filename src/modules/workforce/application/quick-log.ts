import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { listActiveProjects } from '../data/project-refs.repository';
import { listProjectTeamMemberIds } from '../data/project-team.repository';
import { listTimeEntries } from '../data/time-entries.repository';
import { listEmployeesForOrg } from './employees';
import { suggestDefaultEmployee } from './time-entries';

export interface QuickLogFormData {
  readonly employees: readonly { id: string; name: string; assignedToProject?: boolean }[];
  readonly projects: readonly { id: string; name: string }[];
  readonly defaultEmployeeId: string | null;
  readonly recentProjectId: string | null;
  readonly assignedEmployeeIds: readonly string[];
}

export async function loadQuickLogFormData(
  context: OrgContext,
  options: { projectId?: string; employeeId?: string } = {},
): Promise<QuickLogFormData> {
  assertPermission(context, PERMISSIONS.TIME_MANAGE);

  const [employeeRows, projects, suggestedEmployeeId] = await Promise.all([
    listEmployeesForOrg(context, { status: 'active' }),
    listActiveProjects(context.db, context.organizationId),
    suggestDefaultEmployee(context),
  ]);

  const assignedEmployeeIds = options.projectId
    ? await listProjectTeamMemberIds(context.db, context.organizationId, options.projectId)
    : [];
  const assignedSet = new Set(assignedEmployeeIds);

  const employees = [...employeeRows]
    .map((employee) => ({
      id: employee.id,
      name: employee.name,
      assignedToProject: assignedSet.has(employee.id),
    }))
    .sort((left, right) => {
      if (left.assignedToProject !== right.assignedToProject) {
        return left.assignedToProject ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

  const defaultEmployeeId =
    options.employeeId && employees.some((employee) => employee.id === options.employeeId)
      ? options.employeeId
      : assignedEmployeeIds[0] && employees.some((employee) => employee.id === assignedEmployeeIds[0])
        ? assignedEmployeeIds[0]!
        : suggestedEmployeeId;

  const recentEntries = await listTimeEntries(context.db, context.organizationId, {
    employeeId: defaultEmployeeId ?? undefined,
  });
  const recentProjectId =
    options.projectId ?? recentEntries.find((entry) => entry.projectId)?.projectId ?? null;

  return {
    employees,
    projects,
    defaultEmployeeId,
    recentProjectId,
    assignedEmployeeIds,
  };
}
