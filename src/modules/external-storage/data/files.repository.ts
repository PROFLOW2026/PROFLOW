import { and, eq } from 'drizzle-orm';
import { storageFiles } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { ExternalFileRecord } from '../domain/types';

function mapRow(row: typeof storageFiles.$inferSelect): ExternalFileRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    connectionId: row.connectionId,
    documentId: row.documentId,
    documentVersionId: row.documentVersionId,
    externalFileId: row.externalFileId,
    externalParentFolderId: row.externalParentFolderId,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    externalEtag: row.externalEtag,
    checksum: row.checksum,
    status: row.status as ExternalFileRecord['status'],
  };
}

export async function insertStorageFile(
  db: DbExecutor,
  input: {
    organizationId: string;
    connectionId: string;
    documentId?: string | null;
    documentVersionId?: string | null;
    externalFileId: string;
    externalParentFolderId?: string | null;
    originalFilename: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
    externalEtag?: string | null;
    checksum?: string | null;
    status?: ExternalFileRecord['status'];
    createdByUserId?: string | null;
  },
): Promise<ExternalFileRecord> {
  const [row] = await db
    .insert(storageFiles)
    .values({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      documentId: input.documentId ?? null,
      documentVersionId: input.documentVersionId ?? null,
      externalFileId: input.externalFileId,
      externalParentFolderId: input.externalParentFolderId ?? null,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      externalEtag: input.externalEtag ?? null,
      checksum: input.checksum ?? null,
      status: input.status ?? 'synced',
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning();
  return mapRow(row!);
}

export async function listStorageFilesByDocumentId(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
): Promise<ExternalFileRecord[]> {
  const rows = await db
    .select()
    .from(storageFiles)
    .where(
      and(eq(storageFiles.organizationId, organizationId), eq(storageFiles.documentId, documentId)),
    );
  return rows.map(mapRow);
}

export async function findStorageFileByDocumentId(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
): Promise<ExternalFileRecord | null> {
  const [row] = await db
    .select()
    .from(storageFiles)
    .where(
      and(
        eq(storageFiles.organizationId, organizationId),
        eq(storageFiles.documentId, documentId),
      ),
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function findStorageFileByExternalId(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
  externalFileId: string,
): Promise<ExternalFileRecord | null> {
  const [row] = await db
    .select()
    .from(storageFiles)
    .where(
      and(
        eq(storageFiles.organizationId, organizationId),
        eq(storageFiles.connectionId, connectionId),
        eq(storageFiles.externalFileId, externalFileId),
      ),
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function findStorageFileByParentAndName(
  db: DbExecutor,
  input: {
    organizationId: string;
    connectionId: string;
    externalParentFolderId: string;
    originalFilename: string;
  },
): Promise<ExternalFileRecord | null> {
  const [row] = await db
    .select()
    .from(storageFiles)
    .where(
      and(
        eq(storageFiles.organizationId, input.organizationId),
        eq(storageFiles.connectionId, input.connectionId),
        eq(storageFiles.externalParentFolderId, input.externalParentFolderId),
        eq(storageFiles.originalFilename, input.originalFilename),
      ),
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function updateStorageFileByExternalId(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
  externalFileId: string,
  patch: Partial<{
    externalFileId: string;
    externalParentFolderId: string | null;
    originalFilename: string;
    mimeType: string | null;
    sizeBytes: number | null;
    externalEtag: string | null;
    checksum: string | null;
    status: ExternalFileRecord['status'];
    lastError: string | null;
  }>,
): Promise<ExternalFileRecord | null> {
  const [row] = await db
    .update(storageFiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(storageFiles.organizationId, organizationId),
        eq(storageFiles.connectionId, connectionId),
        eq(storageFiles.externalFileId, externalFileId),
      ),
    )
    .returning();
  return row ? mapRow(row) : null;
}

export async function updateStorageFile(
  db: DbExecutor,
  organizationId: string,
  fileId: string,
  patch: Partial<{
    documentId: string | null;
    externalFileId: string;
    externalParentFolderId: string | null;
    originalFilename: string;
    mimeType: string | null;
    sizeBytes: number | null;
    externalEtag: string | null;
    checksum: string | null;
    status: ExternalFileRecord['status'];
    lastError: string | null;
  }>,
): Promise<ExternalFileRecord | null> {
  const [row] = await db
    .update(storageFiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(storageFiles.organizationId, organizationId), eq(storageFiles.id, fileId)),
    )
    .returning();
  return row ? mapRow(row) : null;
}
