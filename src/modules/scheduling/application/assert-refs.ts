import { assertCanAccessProject, findProjectById } from '@/modules/projects';
import { findEmployeeById } from '@/modules/workforce';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';

export async function assertEmployeeInOrg(context: OrgContext, employeeId: string) {
  const employee = await findEmployeeById(context.db, context.organizationId, employeeId);
  if (!employee || employee.archivedAt) throw new NotFoundError('Employee');
  return employee;
}

export async function assertProjectInOrg(context: OrgContext, projectId: string) {
  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project || project.archivedAt) throw new NotFoundError('Project');
  await assertCanAccessProject(context, projectId);
  return project;
}

export async function assertOptionalProjectRefs(
  context: OrgContext,
  input: { projectId?: string | null; workOrderId?: string | null },
) {
  if (input.projectId) await assertProjectInOrg(context, input.projectId);
  if (input.workOrderId) await assertProjectInOrg(context, input.workOrderId);
}
