import { and, eq, isNull } from 'drizzle-orm';
import { taskExternalAssignments } from '@drizzle/schema';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { resolveAccessibleProjectIds } from '@/modules/projects/application/project-access';
import { listProjectWorkspaceLinksByProject } from '@/modules/workspaces';
import {
  getTaskDetail,
  insertTaskActivity,
  updateTaskById,
} from '../data/tasks.repository';
import { listBucketsForBoard } from '../data/boards.repository';
import { buildActivityActorFieldsFromContext } from '../domain/actor';
import { validateProjectContext } from '../domain/project-context';
import { ensureDefaultProjectBoard } from './ensure-default-project-board';
import type { Task } from '../domain/types';

export interface MoveTaskToProjectInput {
  readonly targetProjectId: string;
  readonly targetBoardId?: string | null;
  readonly targetBucketId?: string | null;
  readonly confirmRemoveInaccessibleAssignees?: boolean;
}

async function assertProjectAccessible(context: OrgContext, projectId: string): Promise<void> {
  const accessible = await resolveAccessibleProjectIds(context);
  if (accessible !== null && accessible !== undefined && !accessible.includes(projectId)) {
    throw new ValidationError([{ path: 'targetProjectId', message: 'Target project not accessible' }]);
  }
}

export async function moveTaskToProject(
  context: OrgContext,
  taskId: string,
  input: MoveTaskToProjectInput,
): Promise<Task> {
  assertPermission(context, PERMISSIONS.TASKS_UPDATE);
  await assertProjectAccessible(context, input.targetProjectId);

  const existing = await getTaskDetail(context.db, context.organizationId, taskId);
  if (!existing) throw new NotFoundError('Task');

  if (existing.projectId === input.targetProjectId) {
    throw new ValidationError([{ path: 'targetProjectId', message: 'Task is already in this project' }]);
  }

  const [external] = await context.db
    .select({ taskId: taskExternalAssignments.taskId })
    .from(taskExternalAssignments)
    .where(
      and(
        eq(taskExternalAssignments.taskId, taskId),
        eq(taskExternalAssignments.organizationId, context.organizationId),
        isNull(taskExternalAssignments.closedAt),
      ),
    )
    .limit(1);

  if (external) {
    throw new DomainRuleError(
      'Cannot move a contractor-assigned task to another project',
      'tasks.errors.cannotMoveExternalTask',
    );
  }

  const links = await listProjectWorkspaceLinksByProject(context.db, input.targetProjectId);
  if (links.length === 0) {
    throw new ValidationError([{ path: 'targetProjectId', message: 'Target project has no workspace link' }]);
  }
  const workspaceId = links[0]!.workspaceId;
  validateProjectContext(workspaceId, input.targetProjectId, links);

  let boardId = input.targetBoardId ?? null;
  let bucketId = input.targetBucketId ?? null;
  if (!boardId) {
    const board = await ensureDefaultProjectBoard(context, workspaceId, existing.title);
    boardId = board?.id ?? null;
    if (boardId && !bucketId) {
      const buckets = await listBucketsForBoard(context.db, context.organizationId, boardId);
      bucketId = buckets[0]?.id ?? null;
    }
  }

  const actorFields = buildActivityActorFieldsFromContext(context);
  const fromProjectId = existing.projectId;

  const updated = await updateTaskById(context.db, context.organizationId, taskId, {
    projectId: input.targetProjectId,
    workspaceId,
    boardId,
    bucketId,
  });

  if (!updated) throw new NotFoundError('Task');

  await insertTaskActivity(context.db, {
    taskId,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'automation_changed',
    payload: {
      field: 'projectId',
      from: fromProjectId,
      to: input.targetProjectId,
      moved: true,
      confirmRemoveInaccessibleAssignees: input.confirmRemoveInaccessibleAssignees ?? false,
    },
  });

  return updated;
}
