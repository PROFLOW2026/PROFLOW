import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertCanAccessProject } from '@/modules/projects/application/project-access';
import {
  isActorProjectParticipant,
  type TaskAssigneeActor,
} from '@/modules/projects/application/project-participants';
import { isEmployeeAppUser } from '@/modules/employee-app/application/load-employee-app-context';
import {
  assertEmployeeCanExerciseTaskPermission,
  employeeHasTaskMutationGrant,
} from '@/modules/employee-app/application/task-permission-scope';
import { findTaskById } from '../data/tasks.repository';

export interface TaskAssignmentRef {
  readonly taskId: string;
  readonly projectId: string | null;
}

/**
 * Project-local task assignment auth (Owner decision):
 * caller needs tasks.assign (+ project access when task is project-scoped).
 * Does not grant finance or unrelated task edit rights.
 */
export async function assertCanAssignOnTask(
  context: OrgContext,
  task: TaskAssignmentRef,
): Promise<void> {
  const fullTask = await findTaskById(context.db, context.organizationId, task.taskId);
  if (!fullTask) throw new NotFoundError('Task');

  if (isEmployeeAppUser(context)) {
    const employeeId = context.employeeApp?.employeeId;
    if (!employeeId || !employeeHasTaskMutationGrant(context, PERMISSIONS.TASKS_ASSIGN)) {
      throw new AuthorizationError('Not allowed to assign tasks');
    }
    await assertEmployeeCanExerciseTaskPermission(
      context,
      PERMISSIONS.TASKS_ASSIGN,
      { taskId: task.taskId, projectId: fullTask.projectId },
      employeeId,
    );
    if (fullTask.projectId) {
      await assertCanAccessProject(context, fullTask.projectId);
    }
    return;
  }

  assertPermission(context, PERMISSIONS.TASKS_ASSIGN);
  if (fullTask.projectId) {
    await assertCanAccessProject(context, fullTask.projectId);
  }
}

export async function assertAssigneeIsProjectParticipant(
  context: OrgContext,
  projectId: string,
  actor: TaskAssigneeActor,
): Promise<void> {
  if (!actor.employeeId && !actor.orgMemberId) {
    throw new ValidationError([
      { path: 'assignee', message: 'Must supply employeeId or orgMemberId' },
    ]);
  }

  const allowed = await isActorProjectParticipant(
    context.db,
    context.organizationId,
    projectId,
    context.organization.timezone,
    actor,
  );
  if (!allowed) {
    throw new ValidationError([
      { path: 'assignee', message: 'Assignee must be a project participant' },
    ]);
  }
}

export async function assertCanAssignActorToTask(
  context: OrgContext,
  taskId: string,
  actor: TaskAssigneeActor,
): Promise<{ projectId: string | null }> {
  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

  await assertCanAssignOnTask(context, { taskId, projectId: task.projectId });

  if (task.projectId) {
    await assertAssigneeIsProjectParticipant(context, task.projectId, actor);
  }

  return { projectId: task.projectId };
}

export function callerHasTaskAssignGrant(context: OrgContext): boolean {
  if (isEmployeeAppUser(context)) {
    return employeeHasTaskMutationGrant(context, PERMISSIONS.TASKS_ASSIGN);
  }
  return (
    hasPermission(context, PERMISSIONS.TASKS_ASSIGN) ||
    hasPermission(context, PERMISSIONS.TASKS_MANAGE_ALL)
  );
}
