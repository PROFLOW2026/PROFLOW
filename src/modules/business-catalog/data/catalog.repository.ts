import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { organizationCatalogEntries } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { BusinessCatalogKind, CatalogEntryRecord } from '../domain/types';

function mapRow(row: typeof organizationCatalogEntries.$inferSelect): CatalogEntryRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    kind: row.kind as BusinessCatalogKind,
    key: row.key,
    name: row.name,
    description: row.description ?? null,
    parentId: row.parentId ?? null,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    sortOrder: row.sortOrder,
    isSystem: row.isSystem,
    isActive: row.isActive,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listCatalogEntries(
  db: DbExecutor,
  organizationId: string,
  kind: BusinessCatalogKind,
  options?: { readonly includeInactive?: boolean },
): Promise<CatalogEntryRecord[]> {
  const conditions = [
    eq(organizationCatalogEntries.organizationId, organizationId),
    eq(organizationCatalogEntries.kind, kind),
    isNull(organizationCatalogEntries.archivedAt),
  ];
  if (!options?.includeInactive) {
    conditions.push(eq(organizationCatalogEntries.isActive, true));
  }
  const rows = await db
    .select()
    .from(organizationCatalogEntries)
    .where(and(...conditions))
    .orderBy(asc(organizationCatalogEntries.sortOrder), asc(organizationCatalogEntries.name));
  return rows.map(mapRow);
}

export async function getCatalogEntryByKey(
  db: DbExecutor,
  organizationId: string,
  kind: BusinessCatalogKind,
  key: string,
): Promise<CatalogEntryRecord | null> {
  const rows = await db
    .select()
    .from(organizationCatalogEntries)
    .where(
      and(
        eq(organizationCatalogEntries.organizationId, organizationId),
        eq(organizationCatalogEntries.kind, kind),
        eq(organizationCatalogEntries.key, key),
        isNull(organizationCatalogEntries.archivedAt),
      ),
    )
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getCatalogEntryById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<CatalogEntryRecord | null> {
  const rows = await db
    .select()
    .from(organizationCatalogEntries)
    .where(
      and(
        eq(organizationCatalogEntries.id, id),
        eq(organizationCatalogEntries.organizationId, organizationId),
        isNull(organizationCatalogEntries.archivedAt),
      ),
    )
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function insertCatalogEntry(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly kind: BusinessCatalogKind;
    readonly key: string;
    readonly name: string;
    readonly description?: string | null;
    readonly parentId?: string | null;
    readonly metadata?: Record<string, unknown>;
    readonly sortOrder?: number;
    readonly isSystem?: boolean;
  },
): Promise<CatalogEntryRecord> {
  const [row] = await db
    .insert(organizationCatalogEntries)
    .values({
      organizationId: input.organizationId,
      kind: input.kind,
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      parentId: input.parentId ?? null,
      metadata: input.metadata ?? {},
      sortOrder: input.sortOrder ?? 0,
      isSystem: input.isSystem ?? false,
      isActive: true,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return mapRow(row);
  const existing = await db
    .select()
    .from(organizationCatalogEntries)
    .where(
      and(
        eq(organizationCatalogEntries.organizationId, input.organizationId),
        eq(organizationCatalogEntries.kind, input.kind),
        eq(organizationCatalogEntries.key, input.key),
      ),
    )
    .limit(1);
  if (!existing[0]) {
    throw new Error('catalog insert conflict without existing row');
  }
  return mapRow(existing[0]);
}

export async function updateCatalogEntry(
  db: DbExecutor,
  organizationId: string,
  id: string,
  patch: {
    readonly name?: string;
    readonly description?: string | null;
    readonly parentId?: string | null;
    readonly metadata?: Record<string, unknown>;
    readonly sortOrder?: number;
    readonly isActive?: boolean;
  },
): Promise<CatalogEntryRecord | null> {
  const [row] = await db
    .update(organizationCatalogEntries)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
      ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(organizationCatalogEntries.id, id),
        eq(organizationCatalogEntries.organizationId, organizationId),
        isNull(organizationCatalogEntries.archivedAt),
      ),
    )
    .returning();
  return row ? mapRow(row) : null;
}

export async function archiveCatalogEntry(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .update(organizationCatalogEntries)
    .set({ archivedAt: new Date(), isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(organizationCatalogEntries.id, id),
        eq(organizationCatalogEntries.organizationId, organizationId),
        isNull(organizationCatalogEntries.archivedAt),
      ),
    )
    .returning({ id: organizationCatalogEntries.id });
  return result.length > 0;
}

export async function nextCatalogSortOrder(
  db: DbExecutor,
  organizationId: string,
  kind: BusinessCatalogKind,
): Promise<number> {
  const rows = await db
    .select({
      max: sql<number>`coalesce(max(${organizationCatalogEntries.sortOrder}), 0)`,
    })
    .from(organizationCatalogEntries)
    .where(
      and(
        eq(organizationCatalogEntries.organizationId, organizationId),
        eq(organizationCatalogEntries.kind, kind),
      ),
    );
  return Number(rows[0]?.max ?? 0) + 10;
}
