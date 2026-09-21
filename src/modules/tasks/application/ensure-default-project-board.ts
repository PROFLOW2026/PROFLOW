import type { OrgContext } from '@/shared/auth/context';
import { insertBoard, insertBucket, listBoardsForWorkspace } from '../data/boards.repository';
import { generateSortKey, appendAfter } from '../domain/lexorank';
import type { TaskBoard, TaskStatus } from '../domain/types';

const DEFAULT_BUCKETS: readonly { name: string; statusOnEnter: TaskStatus }[] = [
  { name: 'To do', statusOnEnter: 'todo' },
  { name: 'In progress', statusOnEnter: 'in_progress' },
  { name: 'Done', statusOnEnter: 'done' },
];

/**
 * Ensures a linked project workspace has at least one default board with buckets.
 * Idempotent when boards already exist.
 */
export async function ensureDefaultProjectBoard(
  context: OrgContext,
  workspaceId: string,
  boardName: string,
): Promise<TaskBoard | null> {
  const existing = await listBoardsForWorkspace(context.db, context.organizationId, workspaceId);
  if (existing.length > 0) {
    return existing.find((board) => board.isDefault) ?? existing[0] ?? null;
  }

  const board = await insertBoard(context.db, {
    organizationId: context.organizationId,
    workspaceId,
    name: boardName.trim() || 'Tasks',
    position: 0,
    isDefault: true,
  });

  let sortKey = generateSortKey();
  for (const bucket of DEFAULT_BUCKETS) {
    await insertBucket(context.db, {
      organizationId: context.organizationId,
      boardId: board.id,
      name: bucket.name,
      sortKey,
      statusOnEnter: bucket.statusOnEnter,
    });
    sortKey = appendAfter(sortKey);
  }

  return board;
}
