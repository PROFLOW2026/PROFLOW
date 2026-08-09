import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { listActiveProjects } from '../data/project-refs.repository';
import { listTimeEntries } from '../data/time-entries.repository';
import { listEmployeesForOrg } from './employees';
import { suggestDefaultEmployee } from './time-entries';

export interface QuickLogFormData {
  readonly employees: readonly { id: string; name: string }[];
  readonly projects: readonly { id: string; name: string }[];
  readonly defaultEmployeeId: string | null;
  readonly recentProjectId: string | null;
}

export async function loadQuickLogFormData(
  context: OrgContext,
  options: { projectId?: string } = {},
): Promise<QuickLogFormData> {
  assertPermission(context, PERMISSIONS.TIME_MANAGE);

  const employees = await listEmployeesForOrg(context, { status: 'active' });
  const projects = await listActiveProjects(context.db, context.organizationId);
  const defaultEmployeeId = await suggestDefaultEmployee(context);

  const recentEntries = await listTimeEntries(context.db, context.organizationId, {
    employeeId: defaultEmployeeId ?? undefined,
  });
  const recentProjectId =
    options.projectId ?? recentEntries.find((entry) => entry.projectId)?.projectId ?? null;

  return {
    employees: employees.map((employee) => ({ id: employee.id, name: employee.name })),
    projects,
    defaultEmployeeId,
    recentProjectId,
  };
}
