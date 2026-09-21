import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { findTaskById, updateTaskById } from '../data/tasks.repository';
import { findBucketById } from '../data/boards.repository';
import { isValidTransition } from '../domain/lifecycle';
import { generateSortKey } from '../domain/lexorank';
import { updateTask } from './update-task';
import type { Task, TaskStatus } from '../domain/types';

/**
 * Moves a task to a different bucket.
 *
 * - Updates bucket_id + sort_key
 * - If bucket has statusOnEnter set, applies that status via canonical updateTask + activity
 */
export async function moveTaskToBucket(
  context: OrgContext,
  taskId: string,
  targetBucketId: string,
  options: { sortKey?: string } = {},
): Promise<Task> {
  assertPermission(context, PERMISSIONS.TASKS_UPDATE);

  const [task, bucket] = await Promise.all([
    findTaskById(context.db, context.organizationId, taskId),
    findBucketById(context.db, context.organizationId, targetBucketId),
  ]);

  if (!task) throw new NotFoundError('Task');
  if (!bucket) throw new NotFoundError('Bucket');

  const sortKey = options.sortKey ?? generateSortKey();
  if (sortKey !== task.sortKey) {
    await updateTaskById(context.db, context.organizationId, taskId, { sortKey });
  }

  let statusToApply: TaskStatus | undefined;
  if (bucket.statusOnEnter && bucket.statusOnEnter !== task.status) {
    if (isValidTransition(task.status, bucket.statusOnEnter)) {
      statusToApply = bucket.statusOnEnter;
    }
  }

  return updateTask(context, taskId, {
    bucketId: targetBucketId,
    ...(statusToApply ? { status: statusToApply } : {}),
  });
}
