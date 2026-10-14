import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError, DomainRuleError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { findTaskById, updateTaskById } from '../data/tasks.repository';
import { findBucketById, countActiveTasksInBucket } from '../data/boards.repository';
import { isValidTransition } from '../domain/lifecycle';
import { resolveMoveSortKeyFromNeighbors } from './resolve-move-sort-key';
import { updateTask } from './update-task';
import type { Task, TaskStatus } from '../domain/types';

export type MoveTaskToBucketOptions = {
  sortKey?: string;
  afterTaskId?: string | null;
  beforeTaskId?: string | null;
};

async function resolveNeighborSortKeys(
  context: OrgContext,
  options: MoveTaskToBucketOptions,
): Promise<{ afterSortKey: string | null; beforeSortKey: string | null }> {
  let afterSortKey: string | null = null;
  let beforeSortKey: string | null = null;

  if (options.afterTaskId) {
    const afterTask = await findTaskById(context.db, context.organizationId, options.afterTaskId);
    if (!afterTask) throw new NotFoundError('Task');
    afterSortKey = afterTask.sortKey;
  }

  if (options.beforeTaskId) {
    const beforeTask = await findTaskById(context.db, context.organizationId, options.beforeTaskId);
    if (!beforeTask) throw new NotFoundError('Task');
    beforeSortKey = beforeTask.sortKey;
  }

  return { afterSortKey, beforeSortKey };
}

/**
 * Moves a task to a different bucket.
 *
 * - Updates bucket_id + sort_key (lexorank from neighbors when provided)
 * - Keeps board_id aligned with the target bucket
 * - If bucket has statusOnEnter set, applies that status via canonical updateTask + activity
 */
export async function moveTaskToBucket(
  context: OrgContext,
  taskId: string,
  targetBucketId: string,
  options: MoveTaskToBucketOptions = {},
): Promise<Task> {
  assertPermission(context, PERMISSIONS.TASKS_UPDATE);

  const [task, bucket] = await Promise.all([
    findTaskById(context.db, context.organizationId, taskId),
    findBucketById(context.db, context.organizationId, targetBucketId),
  ]);

  if (!task) throw new NotFoundError('Task');
  if (!bucket) throw new NotFoundError('Bucket');

  if (
    bucket.wipLimit !== null &&
    bucket.wipLimit > 0 &&
    task.bucketId !== targetBucketId
  ) {
    const activeCount = await countActiveTasksInBucket(context.db, targetBucketId);
    if (activeCount >= bucket.wipLimit) {
      throw new DomainRuleError(
        `WIP limit reached: bucket "${bucket.name}" allows at most ${bucket.wipLimit} active task(s) (currently ${activeCount})`,
        'tasks.errors.wipLimitReached',
        { bucketName: bucket.name, wipLimit: bucket.wipLimit, currentCount: activeCount },
      );
    }
  }

  const { afterSortKey, beforeSortKey } = await resolveNeighborSortKeys(context, options);
  const sortKey = resolveMoveSortKeyFromNeighbors({
    explicitSortKey: options.sortKey,
    afterSortKey,
    beforeSortKey,
  });

  if (sortKey !== task.sortKey) {
    await updateTaskById(context.db, context.organizationId, taskId, { sortKey });
  }

  let statusToApply: TaskStatus | undefined;
  if (bucket.statusOnEnter && bucket.statusOnEnter !== task.status) {
    if (isValidTransition(task.status, bucket.statusOnEnter)) {
      statusToApply = bucket.statusOnEnter;
    }
  }

  const bucketChanged = task.bucketId !== targetBucketId;
  const boardChanged = task.boardId !== bucket.boardId;

  if (bucketChanged || boardChanged || statusToApply) {
    return updateTask(context, taskId, {
      ...(bucketChanged ? { bucketId: targetBucketId } : {}),
      ...(boardChanged || bucketChanged ? { boardId: bucket.boardId } : {}),
      ...(statusToApply ? { status: statusToApply } : {}),
    });
  }

  const refreshed = await findTaskById(context.db, context.organizationId, taskId);
  if (!refreshed) throw new NotFoundError('Task');
  return refreshed;
}
