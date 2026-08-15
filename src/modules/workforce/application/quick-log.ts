import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { listProjectTeamMemberIds } from '../data/project-team.repository';
import { listTimeEntries } from '../data/time-entries.repository';
import { findEmployeeByUserId } from '../data/employees.repository';
import type { NonProjectTimeCodeRecord } from '../domain/types';
import { listEmployeesForOrg } from './employees';
import { listNonProjectCodes, listProjectsForTimeLog, suggestDefaultEmployee } from './time-entries';
import { canReadOrgWorkforce } from './time-scope';

export interface QuickLogFormData {
  readonly employees: readonly { id: string; name: string; assignedToProject?: boolean }[];
  readonly projects: readonly { id: string; name: string }[];
  readonly timeCodes: readonly NonProjectTimeCodeRecord[];
  readonly defaultEmployeeId: string | null;
  readonly recentProjectId: string | null;
  readonly assignedEmployeeIds: readonly string[];
  readonly selfScoped: boolean;
}

export async function loadQuickLogFormData(
  context: OrgContext,
  options: { projectId?: string; employeeId?: string } = {},
): Promise<QuickLogFormData> {
  assertPermission(context, PERMISSIONS.TIME_MANAGE);

  const selfScoped = !canReadOrgWorkforce(context);
  const suggestedEmployeeId = await suggestDefaultEmployee(context);

  let employeeRows: readonly { id: string; name: string }[];
  if (selfScoped) {
    const linked = await findEmployeeByUserId(context.db, context.organizationId, context.userId);
    employeeRows = linked ? [{ id: linked.id, name: linked.name }] : [];
  } else {
    employeeRows = await listEmployeesForOrg(context, { status: 'active' });
  }

  const [projects, timeCodes] = await Promise.all([
    listProjectsForTimeLog(context),
    listNonProjectCodes(context),
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

  const defaultEmployeeId = selfScoped
    ? suggestedEmployeeId
    : options.employeeId && employees.some((employee) => employee.id === options.employeeId)
      ? options.employeeId
      : assignedEmployeeIds[0] && employees.some((employee) => employee.id === assignedEmployeeIds[0])
        ? assignedEmployeeIds[0]!
        : suggestedEmployeeId;

  const recentEntries = await listTimeEntries(context.db, context.organizationId, {
    employeeId: defaultEmployeeId ?? undefined,
    status: 'recorded',
  });
  const recentProjectId =
    options.projectId ?? recentEntries.find((entry) => entry.projectId)?.projectId ?? null;

  return {
    employees,
    projects,
    timeCodes,
    defaultEmployeeId,
    recentProjectId,
    assignedEmployeeIds,
    selfScoped,
  };
}
