import { and, desc, eq, isNull } from 'drizzle-orm';
import { documentFolders } from '@drizzle/schema';
import { ORG_LIST_HARD_CAP, resolveListLimit } from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import type { DocumentFolder, DocumentFolderListFilters } from '../domain/types';

function mapFolder(row: typeof documentFolders.$inferSelect): DocumentFolder {
  return {
    id: row.id,
    organizationId: row.organizationId,
    parentId: row.parentId,
    name: row.name,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertDocumentFolder(
  db: DbExecutor,
  input: {
    organizationId: string;
    name: string;
    parentId?: string | null;
    ownerType?: string | null;
    ownerId?: string | null;
  },
): Promise<DocumentFolder> {
  const [row] = await db
    .insert(documentFolders)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      parentId: input.parentId ?? null,
      ownerType: input.ownerType ?? null,
      ownerId: input.ownerId ?? null,
    })
    .returning();

  return mapFolder(row!);
}

export async function findDocumentFolderById(
  db: DbExecutor,
  organizationId: string,
  folderId: string,
): Promise<DocumentFolder | null> {
  const [row] = await db
    .select()
    .from(documentFolders)
    .where(and(eq(documentFolders.id, folderId), eq(documentFolders.organizationId, organizationId)))
    .limit(1);

  return row ? mapFolder(row) : null;
}

export async function listDocumentFolders(
  db: DbExecutor,
  organizationId: string,
  filters: DocumentFolderListFilters = {},
): Promise<DocumentFolder[]> {
  const conditions = [
    eq(documentFolders.organizationId, organizationId),
    isNull(documentFolders.archivedAt),
  ];

  if (filters.ownerType && filters.ownerId) {
    conditions.push(eq(documentFolders.ownerType, filters.ownerType));
    conditions.push(eq(documentFolders.ownerId, filters.ownerId));
  } else {
    conditions.push(isNull(documentFolders.ownerId));
  }

  if (filters.parentId) {
    conditions.push(eq(documentFolders.parentId, filters.parentId));
  }

  const rows = await db
    .select()
    .from(documentFolders)
    .where(and(...conditions))
    .orderBy(desc(documentFolders.createdAt))
    .limit(resolveListLimit(filters.limit, { hardCap: ORG_LIST_HARD_CAP }));

  return rows.map(mapFolder);
}
