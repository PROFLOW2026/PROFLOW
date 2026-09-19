import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import {
  insertBucket,
  findBucketById,
  updateBucketById,
  deleteBucket,
  listBucketsForBoard,
} from '../data/boards.repository';
import { findBoardById } from '../data/boards.repository';
import { generateSortKey, appendAfter } from '../domain/lexorank';
import type { TaskBucket, TaskStatus } from '../domain/types';

export async function createBucket(
  context: OrgContext,
  boardId: string,
  input: {
    name: string;
    color?: string | null;
    wipLimit?: number | null;
    statusOnEnter?: TaskStatus | null;
  },
): Promise<TaskBucket> {
  assertPermission(context, PERMISSIONS.WORKSPACES_MANAGE);

  const board = await findBoardById(context.db, context.organizationId, boardId);
  if (!board) throw new NotFoundError('Board');

  const name = input.name?.trim();
  if (!name) {
    throw new ValidationError([{ path: 'name', message: 'Bucket name is required' }]);
  }

  // Generate sortKey after existing buckets
  const existing = await listBucketsForBoard(context.db, context.organizationId, boardId);
  const lastKey = existing[existing.length - 1]?.sortKey;
  const sortKey = lastKey ? appendAfter(lastKey) : generateSortKey();

  return insertBucket(context.db, {
    organizationId: context.organizationId,
    boardId,
    name,
    sortKey,
    color: input.color ?? null,
    wipLimit: input.wipLimit ?? null,
    statusOnEnter: input.statusOnEnter ?? null,
  });
}

export async function updateBucket(
  context: OrgContext,
  bucketId: string,
  input: {
    name?: string;
    color?: string | null;
    wipLimit?: number | null;
    statusOnEnter?: TaskStatus | null;
  },
): Promise<TaskBucket> {
  assertPermission(context, PERMISSIONS.WORKSPACES_MANAGE);

  const patch: Parameters<typeof updateBucketById>[3] = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ValidationError([{ path: 'name', message: 'Bucket name cannot be empty' }]);
    patch.name = name;
  }
  if (input.color !== undefined) patch.color = input.color;
  if (input.wipLimit !== undefined) patch.wipLimit = input.wipLimit;
  if (input.statusOnEnter !== undefined) patch.statusOnEnter = input.statusOnEnter;

  const updated = await updateBucketById(context.db, context.organizationId, bucketId, patch);
  if (!updated) throw new NotFoundError('Bucket');
  return updated;
}

export async function removeBucket(context: OrgContext, bucketId: string): Promise<void> {
  assertPermission(context, PERMISSIONS.WORKSPACES_MANAGE);

  const bucket = await findBucketById(context.db, context.organizationId, bucketId);
  if (!bucket) throw new NotFoundError('Bucket');

  await deleteBucket(context.db, context.organizationId, bucketId);
}

export async function reorderBuckets(
  context: OrgContext,
  boardId: string,
  orderedBucketIds: string[],
): Promise<void> {
  assertPermission(context, PERMISSIONS.WORKSPACES_MANAGE);

  // Re-space sort keys evenly across the ordered list
  const { rebalanceBucket } = await import('../domain/lexorank');
  const newKeys = rebalanceBucket(orderedBucketIds.map((_, i) => String(i)));

  await Promise.all(
    orderedBucketIds.map((bucketId, index) =>
      updateBucketById(context.db, context.organizationId, bucketId, {
        sortKey: newKeys[index] ?? generateSortKey(),
      }),
    ),
  );
}

export async function listBuckets(
  context: OrgContext,
  boardId: string,
): Promise<TaskBucket[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  return listBucketsForBoard(context.db, context.organizationId, boardId);
}
