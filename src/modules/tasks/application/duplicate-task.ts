import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { listProjectWorkspaceLinksByProject } from '@/modules/workspaces';
import {
  getTaskDetail,
  insertTask,
  insertChecklistItem,
  insertLabelAssignment,
  insertTaskAssignee,
  insertTaskActivity,
  listLabelIdsForTask,
} from '../data/tasks.repository';
import { listBucketsForBoard } from '../data/boards.repository';
import { buildActivityActorFieldsFromContext, buildCreatorFieldsFromContext } from '../domain/actor';
import { validateProjectContext } from '../domain/project-context';
import { generateSortKey } from '../domain/lexorank';
import type { Task } from '../domain/types';
import { withTransaction } from '@/shared/db/client';
import { ensureDefaultProjectBoard } from './ensure-default-project-board';

const DEFAULT_TITLE_SUFFIX = ' (copy)';

export interface DuplicateTaskOptions {
  readonly includeAssignees?: boolean;
  readonly titleSuffix?: string;
  readonly targetProjectId?: string | null;
  readonly targetWorkspaceId?: string | null;
  readonly copyDates?: boolean;
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

  const targetProjectId = options.targetProjectId ?? source.projectId;
  let workspaceId = options.targetWorkspaceId ?? source.workspaceId;
  let boardId = source.boardId;
  let bucketId = source.bucketId;

  if (targetProjectId && targetProjectId !== source.projectId) {
    const links = await listProjectWorkspaceLinksByProject(context.db, targetProjectId);
    if (links.length === 0) {
      throw new ValidationError([{ path: 'targetProjectId', message: 'Target project has no workspace link' }]);
    }
    workspaceId = links[0]!.workspaceId;
    validateProjectContext(workspaceId, targetProjectId, links);
    const board = await ensureDefaultProjectBoard(context, workspaceId, source.title);
    boardId = board?.id ?? null;
    bucketId = null;
    if (boardId) {
      const buckets = await listBucketsForBoard(context.db, context.organizationId, boardId);
      bucketId = buckets[0]?.id ?? null;
    }
  }

  const copyDates = options.copyDates ?? true;

  return withTransaction(context.db, async (tx) => {
    const duplicate = await insertTask(tx, {
      organizationId: context.organizationId,
      workspaceId,
      title: `${source.title}${suffix}`,
      description: source.description,
      projectId: targetProjectId,
      boardId,
      bucketId,
      priority: source.priority,
      startDate: copyDates ? source.startDate : null,
      dueDate: copyDates ? source.dueDate : null,
      estimatedEffortMinutes: source.estimatedEffortMinutes,
      milestoneId: source.milestoneId,
      source: 'manual',
      approvalRequired: false,
      sortKey,
      ...creatorFields,
    });

    for (const item of source.checklistItems) {
      await insertChecklistItem(tx, {
        taskId: duplicate.id,
        organizationId: context.organizationId,
        title: item.title,
        sortKey: item.sortKey,
        dueDate: item.dueDate,
        assigneeOrgMemberId: null,
        assigneeEmployeeId: null,
      });
    }

    const labelIds = await listLabelIdsForTask(tx, source.id);
    for (const labelId of labelIds) {
      await insertLabelAssignment(tx, {
        taskId: duplicate.id,
        labelId,
        organizationId: context.organizationId,
      });
    }

    if (options.includeAssignees) {
      for (const assignee of source.assignees) {
        await insertTaskAssignee(tx, {
          taskId: duplicate.id,
          organizationId: context.organizationId,
          orgMemberId: assignee.orgMemberId,
          employeeId: assignee.employeeId,
          assignedByOrgMemberId: context.membershipId,
        });
      }
    }

    const actorFields = buildActivityActorFieldsFromContext(context);

    await insertTaskActivity(tx, {
      taskId: source.id,
      organizationId: context.organizationId,
      ...actorFields,
      eventType: 'task_duplicated',
      payload: { newTaskId: duplicate.id, newTaskTitle: duplicate.title },
    });

    await insertTaskActivity(tx, {
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
  });
}
