import { and, desc, eq } from 'drizzle-orm';
import { savedListViews } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import {
  isSavedListKey,
  type SavedListKey,
  type SavedListViewRecord,
} from '../domain/saved-list-views';

function asQuery(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') out[key] = entry;
  }
  return out;
}

function mapRow(row: typeof savedListViews.$inferSelect): SavedListViewRecord | null {
  if (!isSavedListKey(row.listKey)) return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    listKey: row.listKey,
    name: row.name,
    query: asQuery(row.queryJson),
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listSavedListViewsForUser(
  db: DbExecutor,
  organizationId: string,
  userId: string,
  listKey: SavedListKey,
): Promise<SavedListViewRecord[]> {
  const rows = await db
    .select()
    .from(savedListViews)
    .where(
      and(
        eq(savedListViews.organizationId, organizationId),
        eq(savedListViews.userId, userId),
        eq(savedListViews.listKey, listKey),
      ),
    )
    .orderBy(desc(savedListViews.isDefault), desc(savedListViews.updatedAt));

  return rows.map(mapRow).filter((row): row is SavedListViewRecord => row !== null);
}

export async function findSavedListViewById(
  db: DbExecutor,
  organizationId: string,
  userId: string,
  id: string,
): Promise<SavedListViewRecord | null> {
  const [row] = await db
    .select()
    .from(savedListViews)
    .where(
      and(
        eq(savedListViews.id, id),
        eq(savedListViews.organizationId, organizationId),
        eq(savedListViews.userId, userId),
      ),
    )
    .limit(1);

  return row ? mapRow(row) : null;
}

export async function findSavedListViewByName(
  db: DbExecutor,
  organizationId: string,
  userId: string,
  listKey: SavedListKey,
  name: string,
): Promise<SavedListViewRecord | null> {
  const [row] = await db
    .select()
    .from(savedListViews)
    .where(
      and(
        eq(savedListViews.organizationId, organizationId),
        eq(savedListViews.userId, userId),
        eq(savedListViews.listKey, listKey),
        eq(savedListViews.name, name),
      ),
    )
    .limit(1);

  return row ? mapRow(row) : null;
}

export async function insertSavedListView(
  db: DbExecutor,
  input: {
    organizationId: string;
    userId: string;
    listKey: SavedListKey;
    name: string;
    query: Record<string, string>;
    isDefault: boolean;
  },
): Promise<SavedListViewRecord> {
  const [row] = await db
    .insert(savedListViews)
    .values({
      organizationId: input.organizationId,
      userId: input.userId,
      listKey: input.listKey,
      name: input.name,
      queryJson: input.query,
      isDefault: input.isDefault,
    })
    .returning();

  return mapRow(row!)!;
}

export async function updateSavedListViewById(
  db: DbExecutor,
  organizationId: string,
  userId: string,
  id: string,
  patch: {
    name?: string;
    query?: Record<string, string>;
    isDefault?: boolean;
  },
): Promise<SavedListViewRecord | null> {
  const [row] = await db
    .update(savedListViews)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.query !== undefined ? { queryJson: patch.query } : {}),
      ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(savedListViews.id, id),
        eq(savedListViews.organizationId, organizationId),
        eq(savedListViews.userId, userId),
      ),
    )
    .returning();

  return row ? mapRow(row) : null;
}

export async function clearDefaultSavedListViews(
  db: DbExecutor,
  organizationId: string,
  userId: string,
  listKey: SavedListKey,
): Promise<void> {
  await db
    .update(savedListViews)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(
      and(
        eq(savedListViews.organizationId, organizationId),
        eq(savedListViews.userId, userId),
        eq(savedListViews.listKey, listKey),
        eq(savedListViews.isDefault, true),
      ),
    );
}

export async function deleteSavedListViewById(
  db: DbExecutor,
  organizationId: string,
  userId: string,
  id: string,
): Promise<boolean> {
  const deleted = await db
    .delete(savedListViews)
    .where(
      and(
        eq(savedListViews.id, id),
        eq(savedListViews.organizationId, organizationId),
        eq(savedListViews.userId, userId),
      ),
    )
    .returning({ id: savedListViews.id });

  return deleted.length > 0;
}
