import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import {
  getTaskDetail,
  insertTask,
  insertChecklistItem,
  insertLabelAssignment,
  insertTaskAssignee,
  insertTaskActivity,
  listLabelIdsForTask,
} from '../data/tasks.repository';
import { buildActivityActorFieldsFromContext, buildCreatorFieldsFromContext } from '../domain/actor';
import { generateSortKey } from '../domain/lexorank';
import type { Task } from '../domain/types';

const DEFAULT_TITLE_SUFFIX = ' (copy)';

export interface DuplicateTaskOptions {
  readonly includeAssignees?: boolean;
  readonly titleSuffix?: string;
}

/**
 * Duplicates a task with checklist, labels, and core fields.
 * Does not copy comments, activity, approvals, time, attachments, or completion state.
 */
export async function duplicateTask(
  context: OrgContext,
  sourceTaskId: string,
  options: DuplicateTaskOptions = {},
): Promise<Task> {
  assertPermission(context, PERMISSIONS.TASKS_CREATE);

  const source = await getTaskDetail(context.db, context.organizationId, sourceTaskId);
  if (!source) throw new NotFoundError('Task');

  const suffix = options.titleSuffix ?? DEFAULT_TITLE_SUFFIX;
  const creatorFields = buildCreatorFieldsFromContext(context);
  const sortKey = generateSortKey();

  const duplicate = await insertTask(context.db, {
    organizationId: context.organizationId,
    workspaceId: source.workspaceId,
    title: `${source.title}${suffix}`,
    description: source.description,
    projectId: source.projectId,
    boardId: source.boardId,
    bucketId: source.bucketId,
    priority: source.priority,
    estimatedEffortMinutes: source.estimatedEffortMinutes,
    milestoneId: source.milestoneId,
    source: 'manual',
    approvalRequired: false,
    sortKey,
    ...creatorFields,
  });

  for (const item of source.checklistItems) {
    await insertChecklistItem(context.db, {
      taskId: duplicate.id,
      organizationId: context.organizationId,
      title: item.title,
      sortKey: item.sortKey,
      dueDate: item.dueDate,
      assigneeOrgMemberId: null,
      assigneeEmployeeId: null,
    });
  }

  const labelIds = await listLabelIdsForTask(context.db, source.id);
  for (const labelId of labelIds) {
    await insertLabelAssignment(context.db, {
      taskId: duplicate.id,
      labelId,
      organizationId: context.organizationId,
    });
  }

  if (options.includeAssignees) {
    for (const assignee of source.assignees) {
      await insertTaskAssignee(context.db, {
        taskId: duplicate.id,
        organizationId: context.organizationId,
        orgMemberId: assignee.orgMemberId,
        employeeId: assignee.employeeId,
        assignedByOrgMemberId: context.membershipId,
      });
    }
  }

  const actorFields = buildActivityActorFieldsFromContext(context);

  await insertTaskActivity(context.db, {
    taskId: source.id,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'task_duplicated',
    payload: { newTaskId: duplicate.id, newTaskTitle: duplicate.title },
  });

  await insertTaskActivity(context.db, {
    taskId: duplicate.id,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'created',
    payload: {
      title: duplicate.title,
      duplicatedFromTaskId: source.id,
      duplicatedFromTitle: source.title,
    },
  });

  return duplicate;
}
