import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import {
  findTaskById,
  findTaskAssignee,
  insertTaskAssignee,
  deleteTaskAssignee,
  insertTaskActivity,
} from '../data/tasks.repository';
import { buildActivityActorFieldsFromContext } from '../domain/actor';
import type { TaskAssignee } from '../domain/types';

export async function addAssignee(
  context: OrgContext,
  taskId: string,
  actor: { orgMemberId?: string | null; employeeId?: string | null },
): Promise<TaskAssignee> {
  assertPermission(context, PERMISSIONS.TASKS_ASSIGN);

  if (!actor.orgMemberId && !actor.employeeId) {
    throw new ValidationError([
      { path: 'actor', message: 'Must supply orgMemberId or employeeId' },
    ]);
  }

  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

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

  return assignee;
}

export async function removeAssignee(
  context: OrgContext,
  taskId: string,
  actor: { orgMemberId?: string | null; employeeId?: string | null },
): Promise<void> {
  assertPermission(context, PERMISSIONS.TASKS_ASSIGN);

  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

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
