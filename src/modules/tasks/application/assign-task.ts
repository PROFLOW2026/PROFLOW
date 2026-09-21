import type { OrgContext } from '@/shared/auth/context';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import {
  findTaskAssignee,
  insertTaskAssignee,
  deleteTaskAssignee,
  insertTaskActivity,
} from '../data/tasks.repository';
import { buildActivityActorFieldsFromContext } from '../domain/actor';
import type { TaskAssignee } from '../domain/types';
import { assertCanAssignActorToTask, assertCanAssignOnTask } from './task-assignment-auth';
import { notifyTaskAssigned } from './notify-task-assignment';

export async function addAssignee(
  context: OrgContext,
  taskId: string,
  actor: { orgMemberId?: string | null; employeeId?: string | null },
): Promise<TaskAssignee> {
  if (!actor.orgMemberId && !actor.employeeId) {
    throw new ValidationError([
      { path: 'actor', message: 'Must supply orgMemberId or employeeId' },
    ]);
  }

  await assertCanAssignActorToTask(context, taskId, actor);

  const existing = await findTaskAssignee(context.db, taskId, actor);
  if (existing) throw new ConflictError('Actor is already an assignee of this task');

  const assignee = await insertTaskAssignee(context.db, {
    taskId,
    organizationId: context.organizationId,
    orgMemberId: actor.orgMemberId ?? null,
    employeeId: actor.employeeId ?? null,
    assignedByOrgMemberId: context.membershipId,
  });

  const actorFields = buildActivityActorFieldsFromContext(context);
  await insertTaskActivity(context.db, {
    taskId,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'assigned',
    payload: {
      orgMemberId: actor.orgMemberId ?? null,
      employeeId: actor.employeeId ?? null,
    },
  });

  const task = await import('../data/tasks.repository').then((repo) =>
    repo.findTaskById(context.db, context.organizationId, taskId),
  );
  if (task) {
    await notifyTaskAssigned(context, {
      taskId,
      taskTitle: task.title,
      assignee: actor,
    });
  }

  return assignee;
}

export async function removeAssignee(
  context: OrgContext,
  taskId: string,
  actor: { orgMemberId?: string | null; employeeId?: string | null },
): Promise<void> {
  const { findTaskById } = await import('../data/tasks.repository');
  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');
  await assertCanAssignOnTask(context, { taskId, projectId: task.projectId });

  const removed = await findTaskAssignee(context.db, taskId, actor);
  if (!removed) throw new NotFoundError('Assignee');

  await deleteTaskAssignee(context.db, taskId, actor);

  const actorFields = buildActivityActorFieldsFromContext(context);
  await insertTaskActivity(context.db, {
    taskId,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'assigned',
    payload: {
      action: 'removed',
      orgMemberId: actor.orgMemberId ?? null,
      employeeId: actor.employeeId ?? null,
    },
  });
}
