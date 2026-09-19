import { and, asc, eq } from 'drizzle-orm';
import { taskBoards, taskBuckets } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { TaskBoard, TaskBucket, TaskStatus } from '../domain/types';

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapBoardRow(row: typeof taskBoards.$inferSelect): TaskBoard {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    name: row.name,
    position: row.position,
    isDefault: row.isDefault,
    isArchived: row.isArchived,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapBucketRow(row: typeof taskBuckets.$inferSelect): TaskBucket {
  return {
    id: row.id,
    organizationId: row.organizationId,
    boardId: row.boardId,
    name: row.name,
    sortKey: row.sortKey,
    color: row.color ?? null,
    wipLimit: row.wipLimit ?? null,
    statusOnEnter: (row.statusOnEnter as TaskStatus) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Boards ───────────────────────────────────────────────────────────────────

export async function insertBoard(
  db: DbExecutor,
  input: {
    organizationId: string;
    workspaceId: string;
    name: string;
    position?: number;
    isDefault?: boolean;
  },
): Promise<TaskBoard> {
  const [row] = await db
    .insert(taskBoards)
    .values({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      name: input.name,
      position: input.position ?? 0,
      isDefault: input.isDefault ?? false,
    })
    .returning();
  return mapBoardRow(row!);
}

export async function findBoardById(
  db: DbExecutor,
  organizationId: string,
  boardId: string,
): Promise<TaskBoard | null> {
  const [row] = await db
    .select()
    .from(taskBoards)
    .where(and(eq(taskBoards.id, boardId), eq(taskBoards.organizationId, organizationId)))
    .limit(1);
  return row ? mapBoardRow(row) : null;
}

export async function updateBoardById(
  db: DbExecutor,
  organizationId: string,
  boardId: string,
  patch: Partial<{
    name: string;
    position: number;
    isArchived: boolean;
    archivedAt: Date | null;
  }>,
): Promise<TaskBoard | null> {
  const [row] = await db
    .update(taskBoards)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(taskBoards.id, boardId), eq(taskBoards.organizationId, organizationId)))
    .returning();
  return row ? mapBoardRow(row) : null;
}

export async function listBoardsForWorkspace(
  db: DbExecutor,
  organizationId: string,
  workspaceId: string,
  includeArchived = false,
): Promise<TaskBoard[]> {
  const conditions = [
    eq(taskBoards.organizationId, organizationId),
    eq(taskBoards.workspaceId, workspaceId),
  ];
  if (!includeArchived) {
    conditions.push(eq(taskBoards.isArchived, false));
  }
  const rows = await db
    .select()
    .from(taskBoards)
    .where(and(...conditions))
    .orderBy(asc(taskBoards.position));
  return rows.map(mapBoardRow);
}

export async function getNextBoardPosition(
  db: DbExecutor,
  workspaceId: string,
): Promise<number> {
  const rows = await db
    .select({ position: taskBoards.position })
    .from(taskBoards)
    .where(and(eq(taskBoards.workspaceId, workspaceId), eq(taskBoards.isArchived, false)))
    .orderBy(asc(taskBoards.position));
  if (rows.length === 0) return 0;
  return (rows[rows.length - 1]?.position ?? 0) + 1;
}

// ─── Buckets ──────────────────────────────────────────────────────────────────

export async function insertBucket(
  db: DbExecutor,
  input: {
    organizationId: string;
    boardId: string;
    name: string;
    sortKey: string;
    color?: string | null;
    wipLimit?: number | null;
    statusOnEnter?: TaskStatus | null;
  },
): Promise<TaskBucket> {
  const [row] = await db
    .insert(taskBuckets)
    .values({
      organizationId: input.organizationId,
      boardId: input.boardId,
      name: input.name,
      sortKey: input.sortKey,
      color: input.color ?? null,
      wipLimit: input.wipLimit ?? null,
      statusOnEnter: input.statusOnEnter ?? null,
    })
    .returning();
  return mapBucketRow(row!);
}

export async function findBucketById(
  db: DbExecutor,
  organizationId: string,
  bucketId: string,
): Promise<TaskBucket | null> {
  const [row] = await db
    .select()
    .from(taskBuckets)
    .where(and(eq(taskBuckets.id, bucketId), eq(taskBuckets.organizationId, organizationId)))
    .limit(1);
  return row ? mapBucketRow(row) : null;
}

export async function updateBucketById(
  db: DbExecutor,
  organizationId: string,
  bucketId: string,
  patch: Partial<{
    name: string;
    sortKey: string;
    color: string | null;
    wipLimit: number | null;
    statusOnEnter: TaskStatus | null;
  }>,
): Promise<TaskBucket | null> {
  const [row] = await db
    .update(taskBuckets)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(taskBuckets.id, bucketId), eq(taskBuckets.organizationId, organizationId)))
    .returning();
  return row ? mapBucketRow(row) : null;
}

export async function deleteBucket(
  db: DbExecutor,
  organizationId: string,
  bucketId: string,
): Promise<void> {
  await db
    .delete(taskBuckets)
    .where(and(eq(taskBuckets.id, bucketId), eq(taskBuckets.organizationId, organizationId)));
}

export async function listBucketsForBoard(
  db: DbExecutor,
  organizationId: string,
  boardId: string,
): Promise<TaskBucket[]> {
  const rows = await db
    .select()
    .from(taskBuckets)
    .where(and(eq(taskBuckets.boardId, boardId), eq(taskBuckets.organizationId, organizationId)))
    .orderBy(asc(taskBuckets.sortKey));
  return rows.map(mapBucketRow);
}
