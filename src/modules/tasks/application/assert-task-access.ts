import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { assertCanAccessProject } from '@/modules/projects/application/project-access';
import { findWorkspaceById, findWorkspaceMember } from '@/modules/workspaces';
import { canViewWorkspace } from '@/modules/workspaces/domain/access';
import { findTaskById } from '../data/tasks.repository';
import type { Task } from '../domain/types';

/**
 * Ensures the caller can read the task (workspace visibility + optional project grant).
 */
export async function assertCanAccessTask(context: OrgContext, taskId: string): Promise<Task> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

  const workspace = await findWorkspaceById(context.db, context.organizationId, task.workspaceId);
  if (!workspace) throw new NotFoundError('Workspace');

  const membership = await findWorkspaceMember(context.db, task.workspaceId, {
    orgMemberId: context.membershipId,
  });

  if (!canViewWorkspace(context, workspace, membership)) {
    throw new AuthorizationError('task.view');
  }

  if (task.projectId) {
    await assertCanAccessProject(context, task.projectId);
  }

  return task;
}
