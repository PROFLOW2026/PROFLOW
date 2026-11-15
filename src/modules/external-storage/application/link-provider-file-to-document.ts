import 'server-only';

import { randomUUID } from 'node:crypto';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertAnyPermission, assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { SemanticFolderType } from '@drizzle/schema/external-storage';
import {
  ensureFirstDocumentVersion,
  findDocumentById,
  flushDocumentCurrentVersionGuards,
  insertDocument,
  updateDocumentById,
} from '@/modules/documents';
import type { DbExecutor } from '@/shared/db/types';
import { isAllowedMimeType, validateUploadConstraints } from '@/modules/documents/domain/file-rules';
import type { DocumentRecord } from '@/modules/documents/domain/types';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  findStorageFileByExternalId,
  insertStorageFile,
  updateStorageFile,
} from '../data/files.repository';
import { assertProjectProviderFileAccess } from './browser-service';

export type EnsureDocumentForProviderFileInput = {
  readonly projectId: string;
  readonly providerFileId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly parentFolderId: string;
  readonly semanticFolderType?: SemanticFolderType;
};

/** After external metadata changes, align current_version_id and flush deferred guards. */
async function finalizeLinkedProviderDocument(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
): Promise<DocumentRecord> {
  const doc = await findDocumentById(db, organizationId, documentId);
  if (!doc) throw new NotFoundError('Document');
  const version = await ensureFirstDocumentVersion(db, doc);
  const synced =
    doc.currentVersionId === version.id
      ? doc
      : ((await updateDocumentById(db, organizationId, documentId, {
          currentVersionId: version.id,
        })) ?? { ...doc, currentVersionId: version.id });
  await flushDocumentCurrentVersionGuards(db);
  return synced;
}

/**
 * Registers an existing cloud provider file as a ProjectFlow document without re-uploading bytes.
 * Deduplicates via storage_files.external_file_id and reuses an existing documents row when present.
 */
export async function ensureDocumentForProviderFile(
  context: OrgContext,
  input: EnsureDocumentForProviderFileInput,
): Promise<DocumentRecord> {
  assertAnyPermission(context, [PERMISSIONS.DOCUMENTS_MANAGE, PERMISSIONS.TAKEOFF_MANAGE]);

  const { connection, file } = await assertProjectProviderFileAccess(
    context,
    input.projectId,
    input.providerFileId,
  );

  const fileName = input.fileName.trim() || file.name;
  const mimeType = (input.mimeType.trim() || file.mimeType || 'application/octet-stream').toLowerCase();
  const parentFolderId = input.parentFolderId.trim() || file.parentId;
  const sizeBytes = file.sizeBytes;

  if (!isAllowedMimeType(mimeType)) {
    throw new DomainRuleError('File type is not allowed', 'documents.errors.mimeNotAllowed');
  }
  if (sizeBytes != null) {
    const validation = validateUploadConstraints({ mimeType, sizeBytes });
    if (!validation.valid && validation.reason === 'size') {
      throw new DomainRuleError('File is too large', 'documents.errors.fileTooLarge');
    }
  }

  if (!parentFolderId) {
    throw new NotFoundError('File');
  }

  const existingStorageFile = await findStorageFileByExternalId(
    context.db,
    context.organizationId,
    connection.id,
    input.providerFileId,
  );

  if (existingStorageFile?.documentId) {
    const existingDocument = await findDocumentById(
      context.db,
      context.organizationId,
      existingStorageFile.documentId,
    );
    if (existingDocument && existingDocument.status !== 'deleted') {
      await updateStorageFile(context.db, context.organizationId, existingStorageFile.id, {
        originalFilename: fileName,
        mimeType,
        sizeBytes,
        externalEtag: file.etag,
        externalParentFolderId: parentFolderId,
        status: 'synced',
      });
      await updateDocumentById(context.db, context.organizationId, existingDocument.id, {
        originalFilename: fileName,
        mimeType,
        sizeBytes,
        externalEtag: file.etag,
        externalParentFolderId: parentFolderId,
        status: 'available',
      });
      return finalizeLinkedProviderDocument(context.db, context.organizationId, existingDocument.id);
    }
  }

  const documentId = existingStorageFile?.documentId ?? randomUUID();
  const existingDocumentRow = await findDocumentById(context.db, context.organizationId, documentId);

  if (!existingDocumentRow) {
    await insertDocument(context.db, {
      id: documentId,
      organizationId: context.organizationId,
      storageBucket: `external:${connection.provider}`,
      storagePath: input.providerFileId,
      originalFilename: fileName,
      mimeType,
      sizeBytes,
      uploadedByUserId: context.userId,
    });
  }

  await updateDocumentById(context.db, context.organizationId, documentId, {
    storageBackend: 'external',
    externalConnectionId: connection.id,
    externalFileId: input.providerFileId,
    externalParentFolderId: parentFolderId,
    externalEtag: file.etag,
    storageBucket: `external:${connection.provider}`,
    storagePath: input.providerFileId,
    originalFilename: fileName,
    mimeType,
    sizeBytes,
    status: 'available',
    deletedAt: null,
  });

  if (existingStorageFile) {
    await updateStorageFile(context.db, context.organizationId, existingStorageFile.id, {
      documentId,
      originalFilename: fileName,
      mimeType,
      sizeBytes,
      externalEtag: file.etag,
      externalParentFolderId: parentFolderId,
      status: 'synced',
    });
  } else {
    await insertStorageFile(context.db, {
      organizationId: context.organizationId,
      connectionId: connection.id,
      documentId,
      externalFileId: input.providerFileId,
      externalParentFolderId: parentFolderId,
      originalFilename: fileName,
      mimeType,
      sizeBytes,
      externalEtag: file.etag,
      status: 'synced',
      createdByUserId: context.userId,
    });
  }

  const finalized = await finalizeLinkedProviderDocument(
    context.db,
    context.organizationId,
    documentId,
  );
  await noteModuleUsage(context.db, context.organizationId, 'documents');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DOCUMENT_FINALIZED,
    entityType: 'document',
    entityId: finalized.id,
    after: {
      id: finalized.id,
      filename: finalized.originalFilename,
      storageBackend: 'external',
      linkedProviderFileId: input.providerFileId,
      projectId: input.projectId,
      semanticFolderType: input.semanticFolderType ?? null,
    },
  });

  return finalized;
}
