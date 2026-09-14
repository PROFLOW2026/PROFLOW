import { createHash } from 'node:crypto';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { withTransaction } from '@/shared/db';
import {
  ConflictError,
  DomainRuleError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { getStoragePort, StorageNotConfiguredError } from '@/shared/ports/storage';
import { validateUploadConstraints } from '../domain/file-rules';
import { isDocumentOwnedStoragePath } from '../domain/version-storage-path';
import type {
  DocumentRecord,
  DocumentVersion,
  DownloadUrlResult,
  PrepareNewVersionResult,
} from '../domain/types';
import {
  findDocumentById,
  findDocumentByIdForUpdate,
  flushDocumentCurrentVersionGuards,
  updateDocumentById,
} from '../data/documents.repository';
import {
  clearCurrentDocumentVersion,
  findDocumentVersionById,
  findMaxVersionNumber,
  insertDocumentVersion,
  listDocumentVersions,
} from '../data/versions.repository';
import {
  documentIdSchema,
  finalizeNewVersionSchema,
  prepareNewVersionSchema,
  versionIdSchema,
} from '../validation/schemas';
import { assertCanReadStoredDocument } from './document-visibility';

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    if ((current as { code?: string }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function assertDocumentAvailable(document: DocumentRecord | null): DocumentRecord {
  if (!document || document.status === 'deleted' || document.deletedAt) {
    throw new NotFoundError('Document');
  }
  if (document.status !== 'available') {
    throw new DomainRuleError('Document is not available', 'documents.errors.notAvailable');
  }
  return document;
}

export async function prepareNewVersionUpload(
  context: OrgContext,
  rawInput: { documentId: string; fileName: string; mimeType: string; sizeBytes: number },
): Promise<PrepareNewVersionResult> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const parsed = prepareNewVersionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const validation = validateUploadConstraints({
    mimeType: parsed.data.mimeType,
    sizeBytes: parsed.data.sizeBytes,
  });
  if (!validation.valid) {
    throw new DomainRuleError(
      validation.reason === 'mime' ? 'File type is not allowed' : 'File is too large',
      validation.reason === 'mime' ? 'documents.errors.mimeNotAllowed' : 'documents.errors.fileTooLarge',
    );
  }

  const document = assertDocumentAvailable(
    await findDocumentById(context.db, context.organizationId, parsed.data.documentId),
  );
  await assertCanReadStoredDocument(context, document);

  const { assertOrganizationStorageAvailable } = await import('@/modules/external-storage/server');
  const connection = await assertOrganizationStorageAvailable(context);
  const { serverEnv } = await import('@/shared/env/server');

  const nextVersionNumber = (await findMaxVersionNumber(context.db, context.organizationId, document.id)) + 1;
  const baseUrl = serverEnv().APP_URL.replace(/\/+$/, '');
  const uploadUrl = `${baseUrl}/api/org-storage/upload/${document.id}?versionNumber=${nextVersionNumber}&fileName=${encodeURIComponent(parsed.data.fileName)}`;

  return {
    document,
    nextVersionNumber,
    uploadMode: 'external',
    uploadUrl,
    uploadToken: null,
    uploadPath: document.id,
    uploadBucket: `external:${connection.provider}`,
    uploadExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  };
}

/**
 * Inserts version N+1, flips current, and points the logical document at the
 * new stored file. Historical versions are never deleted.
 */
export async function uploadNewVersion(
  context: OrgContext,
  rawInput: {
    documentId: string;
    storagePath: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    notes?: string | null;
  },
): Promise<{ document: DocumentRecord; version: DocumentVersion }> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const parsed = finalizeNewVersionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const document = assertDocumentAvailable(
    await findDocumentById(context.db, context.organizationId, parsed.data.documentId),
  );

  const refreshed = await findDocumentById(context.db, context.organizationId, parsed.data.documentId);
  const docForVersion = refreshed ?? document;
  const externalVersion =
    docForVersion.storageBackend === 'external' &&
    (parsed.data.storagePath === docForVersion.externalFileId ||
      parsed.data.storagePath === docForVersion.id);
  if (
    !externalVersion &&
    !isDocumentOwnedStoragePath(context.organizationId, document.id, parsed.data.storagePath)
  ) {
    throw new DomainRuleError(
      'Upload target is not valid for this document',
      'documents.errors.versionPathInvalid',
    );
  }

  const validation = validateUploadConstraints({
    mimeType: parsed.data.mimeType,
    sizeBytes: parsed.data.sizeBytes,
  });
  if (!validation.valid) {
    throw new DomainRuleError(
      validation.reason === 'mime' ? 'File type is not allowed' : 'File is too large',
      validation.reason === 'mime' ? 'documents.errors.mimeNotAllowed' : 'documents.errors.fileTooLarge',
    );
  }

  let verifiedSize = parsed.data.sizeBytes;
  let checksum: string | null = null;
  let versionStoragePath = parsed.data.storagePath;
  if (externalVersion) {
    if (!docForVersion.externalFileId || !docForVersion.externalConnectionId) {
      throw new ServiceUnavailableError(
        'Uploaded file could not be verified',
        'documents.errors.storageVerifyFailed',
      );
    }
    versionStoragePath = docForVersion.externalFileId;
    const { findStorageFileByExternalId } = await import('@/modules/external-storage/data/files.repository');
    const externalFile = await findStorageFileByExternalId(
      context.db,
      context.organizationId,
      docForVersion.externalConnectionId,
      docForVersion.externalFileId,
    );
    if (externalFile?.checksum) checksum = externalFile.checksum;
    if (externalFile?.sizeBytes) verifiedSize = externalFile.sizeBytes;
  } else {
    const storage = getStoragePort();
    if (storage.configured) {
      try {
        const downloaded = await storage.downloadBytes(parsed.data.storagePath);
        if (downloaded.size <= 0) {
          throw new ServiceUnavailableError(
            'Uploaded file could not be verified',
            'documents.errors.storageVerifyFailed',
          );
        }
        verifiedSize = downloaded.size;
        checksum = createHash('sha256').update(downloaded.bytes).digest('hex');
      } catch (error) {
        if (error instanceof ServiceUnavailableError) throw error;
        throw new ServiceUnavailableError(
          'Uploaded file could not be verified',
          'documents.errors.storageVerifyFailed',
        );
      }
    }
  }

  let finalized: {
    previous: DocumentRecord;
    document: DocumentRecord;
    version: DocumentVersion;
  };
  try {
    finalized = await withTransaction(context.db, async (tx) => {
      const locked = assertDocumentAvailable(
        await findDocumentByIdForUpdate(tx, context.organizationId, parsed.data.documentId),
      );

      const nextVersionNumber =
        (await findMaxVersionNumber(tx, context.organizationId, locked.id)) + 1;

      // document_versions_current_uq is UNIQUE(document_id) WHERE is_current:
      // at most one current is allowed; zero is allowed. Unset first so insert
      // of is_current=true cannot collide with the previous current row.
      await clearCurrentDocumentVersion(tx, context.organizationId, locked.id);

      const version = await insertDocumentVersion(tx, {
        organizationId: context.organizationId,
        documentId: locked.id,
        versionNumber: nextVersionNumber,
        storageBucket: locked.storageBucket,
        storagePath: versionStoragePath,
        originalFilename: parsed.data.originalFilename,
        mimeType: parsed.data.mimeType,
        sizeBytes: verifiedSize,
        checksum,
        isCurrent: true,
        uploadedByUserId: context.userId,
        notes: parsed.data.notes ?? null,
      });

      const updated = await updateDocumentById(tx, context.organizationId, locked.id, {
        storagePath: version.storagePath,
        originalFilename: version.originalFilename,
        mimeType: version.mimeType,
        sizeBytes: version.sizeBytes,
        checksum: version.checksum,
        currentVersionId: version.id,
      });
      if (!updated) throw new NotFoundError('Document');

      await flushDocumentCurrentVersionGuards(tx);

      return { previous: locked, document: updated, version };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('A concurrent version upload already claimed this document');
    }
    throw error;
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
    entityType: 'document',
    entityId: finalized.document.id,
    before: {
      currentVersionId: finalized.previous.currentVersionId,
      storagePath: finalized.previous.storagePath,
      versionNumber: finalized.version.versionNumber - 1,
    },
    after: {
      currentVersionId: finalized.version.id,
      storagePath: finalized.version.storagePath,
      versionNumber: finalized.version.versionNumber,
    },
    metadata: {
      previousStoragePath: finalized.previous.storagePath,
      versionId: finalized.version.id,
    },
  });

  return { document: finalized.document, version: finalized.version };
}

export async function listVersions(
  context: OrgContext,
  rawInput: { documentId: string },
): Promise<DocumentVersion[]> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);

  const parsed = documentIdSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const document = await findDocumentById(context.db, context.organizationId, parsed.data.documentId);
  if (!document) throw new NotFoundError('Document');
  await assertCanReadStoredDocument(context, document);

  return listDocumentVersions(context.db, context.organizationId, document.id);
}

export async function createDocumentVersionDownloadUrl(
  context: OrgContext,
  rawInput: { versionId: string },
): Promise<DownloadUrlResult> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);

  const parsed = versionIdSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const version = await findDocumentVersionById(
    context.db,
    context.organizationId,
    parsed.data.versionId,
  );
  if (!version) throw new NotFoundError('Document version');

  const document = await findDocumentById(context.db, context.organizationId, version.documentId);
  if (!document || document.status === 'deleted' || document.deletedAt) {
    throw new NotFoundError('Document');
  }
  await assertCanReadStoredDocument(context, document);

  if (document.storageBackend === 'external' && document.externalConnectionId) {
    const { getExternalFileDownload } = await import('@/modules/external-storage/server');
    const { serverEnv } = await import('@/shared/env/server');
    const external = await getExternalFileDownload(context, {
      connectionId: document.externalConnectionId,
      externalFileId: version.storagePath,
      filename: version.originalFilename,
      mimeType: version.mimeType,
      documentId: document.id,
    });
    if ('url' in external) {
      return {
        url: external.url,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        filename: external.filename,
      };
    }
    const baseUrl = serverEnv().APP_URL.replace(/\/+$/, '');
    return {
      url: `${baseUrl}/api/org-storage/download/${document.id}`,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      filename: external.filename,
    };
  }

  const storage = getStoragePort();
  if (!storage.configured) {
    throw new ServiceUnavailableError(
      'File storage is not configured',
      'documents.errors.storageNotConfigured',
    );
  }

  try {
    const signed = await storage.createDownloadUrl(version.storagePath);
    return {
      url: signed.url,
      expiresAt: signed.expiresAt,
      filename: version.originalFilename,
    };
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      throw new ServiceUnavailableError(
        'File storage is not configured',
        'documents.errors.storageNotConfigured',
      );
    }
    throw error;
  }
}
