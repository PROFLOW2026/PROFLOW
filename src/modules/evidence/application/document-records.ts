import { and, eq } from 'drizzle-orm';
import { documents } from '@drizzle/schema';
import {
  ensureFirstDocumentVersion,
  flushDocumentCurrentVersionGuards,
  insertDocument,
  updateDocumentById,
} from '@/modules/documents';
import { insertDocumentLink } from '@/modules/documents';
import { insertStorageFile } from '@/modules/external-storage/server';
import type { DbExecutor } from '@/shared/db/types';
import { NotFoundError } from '@/shared/errors';
import type { StorageConnectionRef, StoredFile } from './file-store';

/**
 * `documents` stays the authorization record for every project file. Evidence and drawing
 * revisions create ONE document (+ one document_link to the project or the contractor agreement)
 * and point at it; sharing never copies it.
 */

export async function createPendingProjectDocument(
  db: DbExecutor,
  input: {
    readonly documentId: string;
    readonly organizationId: string;
    readonly connection: StorageConnectionRef;
    readonly fileName: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
    readonly uploadedByUserId: string | null;
    readonly owner: { readonly type: 'project' | 'subcontract_agreement'; readonly id: string };
    readonly label: string;
  },
): Promise<void> {
  await insertDocument(db, {
    id: input.documentId,
    organizationId: input.organizationId,
    storageBucket: `external:${input.connection.provider}`,
    storagePath: `pending://${input.documentId}`,
    originalFilename: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    uploadedByUserId: input.uploadedByUserId,
    privacyClass: 'standard',
  });
  await updateDocumentById(db, input.organizationId, input.documentId, {
    storageBackend: 'external',
    externalConnectionId: input.connection.connectionId,
  });
  await flushDocumentCurrentVersionGuards(db);
  await insertDocumentLink(db, {
    organizationId: input.organizationId,
    documentId: input.documentId,
    ownerType: input.owner.type,
    ownerId: input.owner.id,
    label: input.label,
  });
}

/** Records the provider file, marks the document available and creates its first version. */
export async function markProjectDocumentStored(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly documentId: string;
    readonly fileName: string;
    readonly mimeType: string;
    readonly stored: StoredFile;
    readonly uploadedByUserId: string | null;
  },
): Promise<void> {
  await insertStorageFile(db, {
    organizationId: input.organizationId,
    connectionId: input.stored.connectionId,
    documentId: input.documentId,
    externalFileId: input.stored.externalFileId,
    externalParentFolderId: input.stored.externalParentFolderId,
    originalFilename: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.stored.sizeBytes,
    externalEtag: input.stored.etag,
    checksum: input.stored.checksum,
    createdByUserId: input.uploadedByUserId,
  });
  const updated = await updateDocumentById(db, input.organizationId, input.documentId, {
    storageBackend: 'external',
    externalConnectionId: input.stored.connectionId,
    externalFileId: input.stored.externalFileId,
    externalParentFolderId: input.stored.externalParentFolderId,
    externalEtag: input.stored.etag,
    storageBucket: `external:${input.stored.provider}`,
    storagePath: input.stored.externalFileId,
    status: 'available',
    sizeBytes: input.stored.sizeBytes,
    checksum: input.stored.checksum,
  });
  if (!updated) throw new NotFoundError('Document');
  const version = await ensureFirstDocumentVersion(db, updated);
  if (updated.currentVersionId !== version.id) {
    await updateDocumentById(db, input.organizationId, input.documentId, { currentVersionId: version.id });
  }
  await flushDocumentCurrentVersionGuards(db);
}

export interface ProjectDocumentSummary {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number | null;
  readonly status: 'pending' | 'available' | 'deleted';
  readonly deleted: boolean;
}

export async function readDocumentSummary(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
): Promise<ProjectDocumentSummary | null> {
  const [row] = await db
    .select({
      id: documents.id,
      fileName: documents.originalFilename,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      status: documents.status,
      deletedAt: documents.deletedAt,
    })
    .from(documents)
    .where(and(eq(documents.organizationId, organizationId), eq(documents.id, documentId)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    status: row.status,
    deleted: row.deletedAt !== null,
  };
}
