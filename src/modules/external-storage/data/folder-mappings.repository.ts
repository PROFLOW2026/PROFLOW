import { and, eq, isNull, sql } from 'drizzle-orm';
import { storageFolderMappings } from '@drizzle/schema';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import type { SemanticFolderType } from '../domain/types';
import type { DbExecutor } from '@/shared/db/types';
import type { FolderMappingRecord } from '../domain/types';

/**
 * Same elevation as `asServiceRoleWrite`, but a failed statement must not hide
 * the original Postgres error. `SET LOCAL` after a check violation raises 25P02
 * and would otherwise replace the constraint error before the caller can log it.
 */
async function asServiceRoleWritePreservingError<T>(
  db: DbExecutor,
  fn: () => Promise<T>,
): Promise<T> {
  await db.execute(sql`set local role service_role`);
  try {
    const result = await fn();
    await db.execute(sql`set local role authenticated`);
    return result;
  } catch (error) {
    try {
      await db.execute(sql`set local role authenticated`);
    } catch {
      // The statement aborted the transaction. Role reset runs after savepoint rollback.
    }
    throw error;
  }
}

function mapRow(row: typeof storageFolderMappings.$inferSelect): FolderMappingRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    connectionId: row.connectionId,
    semanticFolderType: row.semanticFolderType as SemanticFolderType,
    entityType: row.entityType,
    entityId: row.entityId,
    externalFolderId: row.externalFolderId,
    externalParentId: row.externalParentId,
    displayName: row.displayName,
    status: row.status as FolderMappingRecord['status'],
    lastError: row.lastError,
  };
}

export async function findFolderMapping(
  db: DbExecutor,
  input: {
    organizationId: string;
    connectionId: string;
    semanticFolderType: SemanticFolderType;
    entityType?: string | null;
    entityId?: string | null;
  },
): Promise<FolderMappingRecord | null> {
  const conditions = [
    eq(storageFolderMappings.organizationId, input.organizationId),
    eq(storageFolderMappings.connectionId, input.connectionId),
    eq(storageFolderMappings.semanticFolderType, input.semanticFolderType),
  ];
  if (input.entityId) {
    conditions.push(eq(storageFolderMappings.entityId, input.entityId));
    if (input.entityType) conditions.push(eq(storageFolderMappings.entityType, input.entityType));
  } else {
    conditions.push(isNull(storageFolderMappings.entityId));
  }

  const [row] = await db
    .select()
    .from(storageFolderMappings)
    .where(and(...conditions))
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function insertFolderMapping(
  db: DbExecutor,
  input: {
    organizationId: string;
    connectionId: string;
    semanticFolderType: SemanticFolderType;
    entityType?: string | null;
    entityId?: string | null;
    externalFolderId: string;
    externalParentId?: string | null;
    displayName: string;
    status?: 'pending' | 'ready' | 'error';
    lastError?: string | null;
  },
): Promise<FolderMappingRecord> {
  return asServiceRoleWritePreservingError(db, async () => {
    const [row] = await db
      .insert(storageFolderMappings)
      .values({
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        semanticFolderType: input.semanticFolderType,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        externalFolderId: input.externalFolderId,
        externalParentId: input.externalParentId ?? null,
        displayName: input.displayName,
        status: input.status ?? 'ready',
        lastError: input.lastError ?? null,
      })
      .returning();
    return mapRow(row!);
  });
}

export async function updateFolderMapping(
  db: DbExecutor,
  organizationId: string,
  mappingId: string,
  patch: Partial<{
    externalFolderId: string;
    externalParentId: string | null;
    displayName: string;
    status: 'pending' | 'ready' | 'error';
    lastError: string | null;
  }>,
): Promise<FolderMappingRecord | null> {
  return asServiceRoleWritePreservingError(db, async () => {
    const [row] = await db
      .update(storageFolderMappings)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(storageFolderMappings.organizationId, organizationId),
          eq(storageFolderMappings.id, mappingId),
        ),
      )
      .returning();
    return row ? mapRow(row) : null;
  });
}

export async function findFolderMappingByExternalFolderId(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
  externalFolderId: string,
): Promise<FolderMappingRecord | null> {
  const [row] = await db
    .select()
    .from(storageFolderMappings)
    .where(
      and(
        eq(storageFolderMappings.organizationId, organizationId),
        eq(storageFolderMappings.connectionId, connectionId),
        eq(storageFolderMappings.externalFolderId, externalFolderId),
      ),
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function listFolderMappingsForProject(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
  projectId: string,
): Promise<FolderMappingRecord[]> {
  const rows = await db
    .select()
    .from(storageFolderMappings)
    .where(
      and(
        eq(storageFolderMappings.organizationId, organizationId),
        eq(storageFolderMappings.connectionId, connectionId),
        eq(storageFolderMappings.entityType, 'project'),
        eq(storageFolderMappings.entityId, projectId),
      ),
    );
  return rows.map(mapRow);
}

export async function listFolderMappingsForConnection(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
): Promise<FolderMappingRecord[]> {
  const rows = await db
    .select()
    .from(storageFolderMappings)
    .where(
      and(
        eq(storageFolderMappings.organizationId, organizationId),
        eq(storageFolderMappings.connectionId, connectionId),
      ),
    );
  return rows.map(mapRow);
}

export async function listOrgLevelFolderMappingsForConnection(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
): Promise<FolderMappingRecord[]> {
  const rows = await db
    .select()
    .from(storageFolderMappings)
    .where(
      and(
        eq(storageFolderMappings.organizationId, organizationId),
        eq(storageFolderMappings.connectionId, connectionId),
        isNull(storageFolderMappings.entityId),
      ),
    );
  return rows.map(mapRow);
}

export async function deleteFolderMappingsForConnection(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
): Promise<number> {
  return asServiceRoleWrite(db, async () => {
    const deleted = await db
      .delete(storageFolderMappings)
      .where(
        and(
          eq(storageFolderMappings.organizationId, organizationId),
          eq(storageFolderMappings.connectionId, connectionId),
        ),
      )
      .returning({ id: storageFolderMappings.id });
    return deleted.length;
  });
}
