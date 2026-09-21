import 'server-only';

import { submitApprovalRequest } from '@/modules/approvals';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import {
  findTaskById,
  insertTask,
  insertTaskActivity,
  insertTaskAssignee,
  insertLabelAssignment,
  findLabelById,
} from '../data/tasks.repository';
import { buildSystemCreatorFields, buildSystemActivityActorFields } from '../domain/actor';
import { generateSortKey } from '../domain/lexorank';
import { updateTaskAsSystem } from './update-task-as-system';
import type { AutomationMatch } from '@/modules/automations/domain/types';
import type { TaskPriority, TaskStatus } from '../domain/types';

export async function createTaskAsSystem(
  context: OrgContext,
  match: AutomationMatch,
  payload: Record<string, unknown> = {},
) {
  const workspaceId = String(payload.workspaceId ?? match.workspaceId ?? '');
  const title = String(payload.title ?? match.title ?? 'Automation task');
  if (!workspaceId) throw new NotFoundError('Workspace');

  const task = await insertTask(context.db, {
    organizationId: context.organizationId,
    workspaceId,
    title: title.slice(0, 500),
    description: payload.description ? String(payload.description).slice(0, 10000) : null,
    projectId: (payload.projectId as string | null | undefined) ?? match.projectId ?? null,
    boardId: (payload.boardId as string | null | undefined) ?? null,
    bucketId: (payload.bucketId as string | null | undefined) ?? null,
    priority: (payload.priority as TaskPriority | undefined) ?? 'medium',
    source: 'automation',
    sortKey: generateSortKey(),
    ...buildSystemCreatorFields(),
  });

  const systemActor = buildSystemActivityActorFields();
  await insertTaskActivity(context.db, {
    taskId: task.id,
    organizationId: context.organizationId,
    ...systemActor,
    eventType: 'system_generated',
    payload: { source: 'automation', matchEntityType: match.entityType },
  });

  return task;
}

export async function changeTaskStatusAsSystem(
  context: OrgContext,
  match: AutomationMatch,
  payload: Record<string, unknown> = {},
) {
  const taskId = String(payload.taskId ?? match.taskId ?? match.entityId);
  const status = payload.status as TaskStatus;
  if (!status) return null;
  return updateTaskAsSystem(context, taskId, { status });
}

export async function assignTaskAsSystem(
  context: OrgContext,
  match: AutomationMatch,
  payload: Record<string, unknown> = {},
) {
  const taskId = String(payload.taskId ?? match.taskId ?? match.entityId);
  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

  const orgMemberId = (payload.orgMemberId as string | null | undefined) ?? null;
  const employeeId = (payload.employeeId as string | null | undefined) ?? null;
  if (!orgMemberId && !employeeId) return null;

  await insertTaskAssignee(context.db, {
    taskId,
    organizationId: context.organizationId,
    orgMemberId,
    employeeId,
    assignedByOrgMemberId: null,
  });

  const systemActor = buildSystemActivityActorFields();
  await insertTaskActivity(context.db, {
    taskId,
    organizationId: context.organizationId,
    ...systemActor,
    eventType: 'assigned',
    payload: { orgMemberId, employeeId, auto: true },
  });

  return task;
}

export async function addTaskLabelAsSystem(
  context: OrgContext,
  match: AutomationMatch,
  payload: Record<string, unknown> = {},
) {
  const taskId = String(payload.taskId ?? match.taskId ?? match.entityId);
  const labelId = String(payload.labelId ?? '');
  if (!labelId) return null;

  const [task, label] = await Promise.all([
    findTaskById(context.db, context.organizationId, taskId),
    findLabelById(context.db, context.organizationId, labelId),
  ]);
  if (!task) throw new NotFoundError('Task');
  if (!label) throw new NotFoundError('Label');

  await insertLabelAssignment(context.db, {
    taskId,
    labelId,
    organizationId: context.organizationId,
  });

  const systemActor = buildSystemActivityActorFields();
  await insertTaskActivity(context.db, {
    taskId,
    organizationId: context.organizationId,
    ...systemActor,
    eventType: 'label_added',
    payload: { labelId, labelName: label.name, auto: true },
  });

  return task;
}

export async function createTaskApprovalAsSystem(
  context: OrgContext,
  match: AutomationMatch,
  payload: Record<string, unknown> = {},
) {
  const taskId = String(payload.taskId ?? match.taskId ?? match.entityId);
  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

  await submitApprovalRequest(context, {
    entityType: 'task',
    entityId: taskId,
    amount: null,
    currency: null,
  });

  const systemActor = buildSystemActivityActorFields();
  await insertTaskActivity(context.db, {
    taskId,
    organizationId: context.organizationId,
    ...systemActor,
    eventType: 'system_generated',
    payload: { action: 'approval_requested', auto: true },
  });

  return task;
}
