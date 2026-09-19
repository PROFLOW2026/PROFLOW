import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import {
  findTaskById,
  updateTaskById,
  insertTaskActivity,
} from '../data/tasks.repository';
import { findBucketById } from '../data/boards.repository';
import { buildActivityActorFieldsFromContext } from '../domain/actor';
import { isValidTransition } from '../domain/lifecycle';
import { generateSortKey } from '../domain/lexorank';
import type { Task } from '../domain/types';

/**
 * Moves a task to a different bucket.
 *
 * - Updates bucket_id + sort_key
 * - If bucket has statusOnEnter set, applies that status automatically (if valid transition)
 * - Records 'bucket_changed' activity
 * - Records 'status_changed' activity if status was auto-applied
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
  const actorFields = buildActivityActorFieldsFromContext(context);

  const patch: Parameters<typeof updateTaskById>[3] = {
    bucketId: targetBucketId,
    sortKey,
  };

  let statusChanged = false;
  const previousStatus = task.status;

  // Apply automatic status if bucket has statusOnEnter configured
  if (bucket.statusOnEnter && bucket.statusOnEnter !== task.status) {
    if (isValidTransition(task.status, bucket.statusOnEnter)) {
      patch.status = bucket.statusOnEnter;
      statusChanged = true;

      if (bucket.statusOnEnter === 'done') {
        patch.completionDate = new Date().toISOString().split('T')[0]!;
        patch.completedByOrgMemberId = context.membershipId;
      }
    }
  }

  const updated = await updateTaskById(context.db, context.organizationId, taskId, patch);
  if (!updated) throw new NotFoundError('Task');

  // Record bucket_changed activity
  await insertTaskActivity(context.db, {
    taskId,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'bucket_changed',
    payload: { from: task.bucketId, to: targetBucketId },
  });

  // Record status_changed if auto-applied
  if (statusChanged && bucket.statusOnEnter) {
    await insertTaskActivity(context.db, {
      taskId,
      organizationId: context.organizationId,
      ...actorFields,
      eventType: 'status_changed',
      payload: { from: previousStatus, to: bucket.statusOnEnter, auto: true },
    });
  }

  return updated;
}
