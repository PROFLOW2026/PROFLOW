import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { insertTask, insertTaskActivity } from '../data/tasks.repository';
import { listProjectWorkspaceLinksByWorkspace } from '@/modules/workspaces';
import { validateProjectContext } from '../domain/project-context';
import { buildCreatorFieldsFromContext, buildActivityActorFieldsFromContext } from '../domain/actor';
import { generateSortKey } from '../domain/lexorank';
import { createTaskSchema } from '../validation/task-schema';
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

  // Validate project context (rule C)
  if (input.projectId) {
    const links = await listProjectWorkspaceLinksByWorkspace(context.db, input.workspaceId);
    validateProjectContext(input.workspaceId, input.projectId, links);
  }

  const creatorFields = buildCreatorFieldsFromContext(context);
  const sortKey = generateSortKey();

  const task = await insertTask(context.db, {
    organizationId: context.organizationId,
    workspaceId: input.workspaceId,
    title: input.title,
    description: input.description ?? null,
    projectId: input.projectId ?? null,
    boardId: input.boardId ?? null,
    bucketId: input.bucketId ?? null,
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

  return task;
}
