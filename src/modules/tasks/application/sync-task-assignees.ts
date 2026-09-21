import 'server-only';

import { and, eq } from 'drizzle-orm';
import { taskAssignees } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import {
  parseProjectParticipantAssigneeKey,
  resolveProjectParticipantAssigneeKeys,
  type TaskAssigneeActor,
} from '@/modules/projects/application/project-participants';
import {
  deleteTaskAssignee,
  findTaskAssignee,
  findTaskById,
  insertTaskAssignee,
  insertTaskActivity,
} from '../data/tasks.repository';
import { buildActivityActorFieldsFromContext } from '../domain/actor';
import { assertCanAssignOnTask, assertAssigneeIsProjectParticipant } from './task-assignment-auth';
import { notifyTaskAssigned } from './notify-task-assignment';

function actorKey(actor: TaskAssigneeActor): string {
  if (actor.employeeId) return `e:${actor.employeeId}`;
  if (actor.orgMemberId) return `m:${actor.orgMemberId}`;
  return '';
}

async function listCurrentAssigneeActors(
  context: OrgContext,
  taskId: string,
): Promise<TaskAssigneeActor[]> {
  const rows = await context.db
    .select({
      employeeId: taskAssignees.employeeId,
      orgMemberId: taskAssignees.orgMemberId,
    })
    .from(taskAssignees)
    .where(
      and(
        eq(taskAssignees.taskId, taskId),
        eq(taskAssignees.organizationId, context.organizationId),
      ),
    );

  return rows.map((row) => ({
    employeeId: row.employeeId,
    orgMemberId: row.orgMemberId,
  }));
}

export interface SyncTaskAssigneesInput {
  readonly assigneeKeys?: readonly string[];
  readonly assignAllProjectTeam?: boolean;
}

/**
 * Replaces task assignees with the requested project participants.
 * `assignAllProjectTeam` expands to all effective participants — no fake ALL row in DB.
 */
export async function syncTaskAssignees(
  context: OrgContext,
  taskId: string,
  input: SyncTaskAssigneesInput,
): Promise<void> {
  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) {
    const { NotFoundError } = await import('@/shared/errors');
    throw new NotFoundError('Task');
  }

  await assertCanAssignOnTask(context, { taskId, projectId: task.projectId });

  if (!task.projectId && input.assignAllProjectTeam) {
    throw new ValidationError([
      { path: 'assignAllProjectTeam', message: 'Whole-team assign requires a project task' },
    ]);
  }

  let desiredKeys = [...(input.assigneeKeys ?? [])];
  if (input.assignAllProjectTeam) {
    if (!task.projectId) throw new ValidationError([{ path: 'projectId', message: 'Required' }]);
    desiredKeys = await resolveProjectParticipantAssigneeKeys(
      context.db,
      context.organizationId,
      task.projectId,
      context.organization.timezone,
    );
  }

  const desiredActors: TaskAssigneeActor[] = [];
  for (const key of desiredKeys) {
    const actor = parseProjectParticipantAssigneeKey(key);
    if (task.projectId) {
      await assertAssigneeIsProjectParticipant(context, task.projectId, actor);
    }
    desiredActors.push(actor);
  }

  const dedupedDesired = new Map<string, TaskAssigneeActor>();
  for (const actor of desiredActors) {
    const key = actorKey(actor);
    if (key) dedupedDesired.set(key, actor);
  }

  const current = await listCurrentAssigneeActors(context, taskId);
  const currentKeys = new Set(current.map(actorKey).filter(Boolean));
  const nextKeys = new Set(dedupedDesired.keys());

  const actorFields = buildActivityActorFieldsFromContext(context);
  const assignedByOrgMemberId = context.membershipId ?? null;

  for (const key of currentKeys) {
    if (nextKeys.has(key)) continue;
    const actor = current.find((row) => actorKey(row) === key);
    if (!actor) continue;
    await deleteTaskAssignee(context.db, taskId, actor);
    await insertTaskActivity(context.db, {
      taskId,
      organizationId: context.organizationId,
      ...actorFields,
      eventType: 'assigned',
      payload: {
        action: 'removed',
        employeeId: actor.employeeId ?? null,
        orgMemberId: actor.orgMemberId ?? null,
      },
    });
  }

  for (const [key, actor] of dedupedDesired) {
    if (currentKeys.has(key)) continue;
    const existing = await findTaskAssignee(context.db, taskId, actor);
    if (existing) continue;

    await insertTaskAssignee(context.db, {
      taskId,
      organizationId: context.organizationId,
      employeeId: actor.employeeId ?? null,
      orgMemberId: actor.orgMemberId ?? null,
      assignedByOrgMemberId,
    });

    await insertTaskActivity(context.db, {
      taskId,
      organizationId: context.organizationId,
      ...actorFields,
      eventType: 'assigned',
      payload: {
        employeeId: actor.employeeId ?? null,
        orgMemberId: actor.orgMemberId ?? null,
      },
    });

    await notifyTaskAssigned(context, {
      taskId,
      taskTitle: task.title,
      assignee: actor,
    });
  }
}
