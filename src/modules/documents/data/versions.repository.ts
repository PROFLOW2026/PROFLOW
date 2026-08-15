import { and, desc, eq, sql } from 'drizzle-orm';
import { documentVersions } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { DocumentRecord, DocumentVersion } from '../domain/types';

function mapVersion(row: typeof documentVersions.$inferSelect): DocumentVersion {
  return {
    id: row.id,
    organizationId: row.organizationId,
    documentId: row.documentId,
    versionNumber: row.versionNumber,
    storageBucket: row.storageBucket,
    storagePath: row.storagePath,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    checksum: row.checksum,
    isCurrent: row.isCurrent,
    uploadedByUserId: row.uploadedByUserId,
    uploadedAt: row.uploadedAt,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertDocumentVersion(
  db: DbExecutor,
  input: {
    organizationId: string;
    documentId: string;
    versionNumber: number;
    storageBucket: string;
    storagePath: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes?: number | null;
    checksum?: string | null;
    isCurrent: boolean;
    uploadedByUserId?: string | null;
    notes?: string | null;
  },
): Promise<DocumentVersion> {
  const [row] = await db
    .insert(documentVersions)
    .values({
      organizationId: input.organizationId,
      documentId: input.documentId,
      versionNumber: input.versionNumber,
      storageBucket: input.storageBucket,
      storagePath: input.storagePath,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes ?? null,
      checksum: input.checksum ?? null,
      isCurrent: input.isCurrent,
      uploadedByUserId: input.uploadedByUserId ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return mapVersion(row!);
}

export async function listDocumentVersions(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
): Promise<DocumentVersion[]> {
  const rows = await db
    .select()
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.organizationId, organizationId),
        eq(documentVersions.documentId, documentId),
      ),
    )
    .orderBy(desc(documentVersions.versionNumber));

  return rows.map(mapVersion);
}

export async function findDocumentVersionById(
  db: DbExecutor,
  organizationId: string,
  versionId: string,
): Promise<DocumentVersion | null> {
  const [row] = await db
    .select()
    .from(documentVersions)
    .where(and(eq(documentVersions.id, versionId), eq(documentVersions.organizationId, organizationId)))
    .limit(1);

  return row ? mapVersion(row) : null;
}

export async function findMaxVersionNumber(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${documentVersions.versionNumber}), 0)::int` })
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.organizationId, organizationId),
        eq(documentVersions.documentId, documentId),
      ),
    );

  return row?.max ?? 0;
}

export async function clearCurrentDocumentVersion(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
): Promise<void> {
  await db
    .update(documentVersions)
    .set({ isCurrent: false, updatedAt: new Date() })
    .where(
      and(
        eq(documentVersions.organizationId, organizationId),
        eq(documentVersions.documentId, documentId),
        eq(documentVersions.isCurrent, true),
      ),
    );
}

/**
 * First upload of a logical document inserts version 1 if none exists.
 * Never deletes or rewrites an existing stored file row.
 */
export async function ensureFirstDocumentVersion(
  db: DbExecutor,
  document: DocumentRecord,
): Promise<DocumentVersion> {
  const existing = await listDocumentVersions(db, document.organizationId, document.id);
  if (existing.length > 0) {
    return existing.find((version) => version.isCurrent) ?? existing[0]!;
  }

  return insertDocumentVersion(db, {
    organizationId: document.organizationId,
    documentId: document.id,
    versionNumber: 1,
    storageBucket: document.storageBucket,
    storagePath: document.storagePath,
    originalFilename: document.originalFilename,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    checksum: document.checksum,
    isCurrent: true,
    uploadedByUserId: document.uploadedByUserId,
  });
}
