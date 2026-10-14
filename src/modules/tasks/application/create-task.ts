import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { findTaskById, insertTask, insertTaskActivity } from '../data/tasks.repository';
import { findBucketById, listBucketsForBoard } from '../data/boards.repository';
import { ensureDefaultProjectBoard } from './ensure-default-project-board';
import { listProjectWorkspaceLinksByWorkspace } from '@/modules/workspaces';
import { validateProjectContext } from '../domain/project-context';
import { buildCreatorFieldsFromContext, buildActivityActorFieldsFromContext } from '../domain/actor';
import { generateSortKey } from '../domain/lexorank';
import { assertMaxSubtaskDepth, assertSameWorkspaceContext } from '../domain/subtasks';
import { createTaskSchema } from '../validation/task-schema';
import { assertStartBeforeDue } from '../domain/start-before-due';
import type { Task, CreateTaskInput } from '../domain/types';

/**
 * Creates a task.
 *
 * Rules enforced:
 * - Caller must have TASKS_CREATE
 * - If projectId is set, (workspaceId, projectId) must exist in project_workspace_links
 * - Creator fields set from OrgContext (human actor)
 * - Records 'created' activity event
 */
export async function createTask(
  context: OrgContext,
  rawInput: CreateTaskInput,
): Promise<Task> {
  assertPermission(context, PERMISSIONS.TASKS_CREATE);

  const parsed = createTaskSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const input = parsed.data;
  assertStartBeforeDue(input.startDate ?? null, input.dueDate ?? null);

  let boardId = input.boardId ?? null;
  let bucketId = input.bucketId ?? null;

  if (bucketId && !boardId) {
    const bucket = await findBucketById(context.db, context.organizationId, bucketId);
    if (!bucket) {
      throw new ValidationError([{ path: 'bucketId', message: 'Bucket not found' }]);
    }
    boardId = bucket.boardId;
  }

  if (boardId && bucketId) {
    const bucket = await findBucketById(context.db, context.organizationId, bucketId);
    if (!bucket || bucket.boardId !== boardId) {
      throw new ValidationError([
        { path: 'bucketId', message: 'Bucket does not belong to the selected board' },
      ]);
    }
  }

  if (input.projectId && !boardId) {
    const board = await ensureDefaultProjectBoard(
      context,
      input.workspaceId,
      input.title.trim().slice(0, 80) || 'Tasks',
    );
    boardId = board?.id ?? null;
    if (boardId && !bucketId) {
      const buckets = await listBucketsForBoard(context.db, context.organizationId, boardId);
      bucketId = buckets[0]?.id ?? null;
    }
  }

  // Validate project context (rule C)
  if (input.projectId) {
    const links = await listProjectWorkspaceLinksByWorkspace(context.db, input.workspaceId);
    validateProjectContext(input.workspaceId, input.projectId, links);
  }

  if (input.parentTaskId) {
    const parentTask = await findTaskById(context.db, context.organizationId, input.parentTaskId);
    if (!parentTask) {
      throw new ValidationError([{ path: 'parentTaskId', message: 'Parent task not found' }]);
    }
    assertMaxSubtaskDepth(parentTask);
    assertSameWorkspaceContext(parentTask, input.workspaceId, input.projectId);
  }

  const creatorFields = buildCreatorFieldsFromContext(context);
  const sortKey = generateSortKey();

  const task = await insertTask(context.db, {
    organizationId: context.organizationId,
    workspaceId: input.workspaceId,
    title: input.title,
    description: input.description ?? null,
    projectId: input.projectId ?? null,
    boardId,
    bucketId,
    priority: input.priority,
    startDate: input.startDate ?? null,
    dueDate: input.dueDate ?? null,
    parentTaskId: input.parentTaskId ?? null,
    estimatedEffortMinutes: input.estimatedEffortMinutes ?? null,
    milestoneId: input.milestoneId ?? null,
    source: input.source,
    approvalRequired: input.approvalRequired,
    sortKey,
    ...creatorFields,
  });

  // Record creation activity
  const actorFields = buildActivityActorFieldsFromContext(context);
  await insertTaskActivity(context.db, {
    taskId: task.id,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'created',
    payload: { title: task.title },
  });

  if (
    (input.assigneeKeys && input.assigneeKeys.length > 0) ||
    input.assignAllProjectTeam
  ) {
    const { syncTaskAssignees } = await import('./sync-task-assignees');
    await syncTaskAssignees(context, task.id, {
      assigneeKeys: input.assigneeKeys,
      assignAllProjectTeam: input.assignAllProjectTeam,
    });
  }

  return task;
}
