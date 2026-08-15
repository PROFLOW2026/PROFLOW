import { createHash } from 'node:crypto';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError, ServiceUnavailableError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { getStoragePort, StorageNotConfiguredError } from '@/shared/ports/storage';
import { validateUploadConstraints } from '../domain/file-rules';
import type { DocumentRecord, DownloadUrlResult } from '../domain/types';
import { findDocumentById, listDeletedDocumentsNeedingStorageCleanup, updateDocumentById, flushDocumentCurrentVersionGuards } from '../data/documents.repository';
import { assertCanReadStoredDocument } from './document-visibility';
import { ensureFirstDocumentVersion } from '../data/versions.repository';
import {
  isStorageOrphanChecksum,
  removeStorageObjectWithRetry,
  restoreChecksumIfOrphanEncoded,
  truncateStorageCleanupError,
  type StorageCleanupStatus,
} from '../domain/storage-cleanup';
import {
  documentIdSchema,
  finalizeUploadSchema,
  type FinalizeUploadInput,
} from '../validation/schemas';

export interface StorageCleanupRetryResult {
  readonly attempted: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly succeededIds: readonly string[];
  readonly failedIds: readonly string[];
}

export async function finalizeDocumentUpload(
  context: OrgContext,
  rawInput: FinalizeUploadInput,
): Promise<DocumentRecord> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const parsed = finalizeUploadSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findDocumentById(context.db, context.organizationId, parsed.data.documentId);
  if (!existing) throw new NotFoundError('Document');

  if (existing.status !== 'pending') {
    throw new DomainRuleError('Document is not awaiting upload', 'documents.errors.notPending');
  }

  const validation = validateUploadConstraints({
    mimeType: existing.mimeType,
    sizeBytes: parsed.data.sizeBytes,
  });
  if (!validation.valid) {
    throw new DomainRuleError('File is too large', 'documents.errors.fileTooLarge');
  }

  const storage = getStoragePort();
  let verifiedSize = parsed.data.sizeBytes;
  let checksum = parsed.data.checksum ?? null;
  if (storage.configured) {
    try {
      const downloaded = await storage.downloadBytes(existing.storagePath);
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

  const updated = await updateDocumentById(context.db, context.organizationId, parsed.data.documentId, {
    status: 'available',
    sizeBytes: verifiedSize,
    checksum,
  });

  if (!updated) throw new NotFoundError('Document');

  const version = await ensureFirstDocumentVersion(context.db, updated);
  const withCurrent =
    updated.currentVersionId === version.id
      ? updated
      : await updateDocumentById(context.db, context.organizationId, updated.id, {
          currentVersionId: version.id,
        });
  const result = withCurrent ?? updated;

  await flushDocumentCurrentVersionGuards(context.db);

  await recordAuditEvent(context, {
    action: 'document.finalized',
    entityType: 'document',
    entityId: result.id,
    before: { status: existing.status },
    after: { status: result.status, sizeBytes: result.sizeBytes, currentVersionId: result.currentVersionId },
  });

  return result;
}

export async function getDocumentById(
  context: OrgContext,
  documentId: string,
): Promise<DocumentRecord | null> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const document = await findDocumentById(context.db, context.organizationId, documentId);
  if (!document) return null;
  try {
    await assertCanReadStoredDocument(context, document);
  } catch {
    return null;
  }
  return document;
}

export async function createDocumentDownloadUrl(
  context: OrgContext,
  rawInput: { documentId: string },
): Promise<DownloadUrlResult> {
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

  if (document.status !== 'available' || document.deletedAt) {
    throw new NotFoundError('Document');
  }

  const storage = getStoragePort();
  if (!storage.configured) {
    throw new ServiceUnavailableError(
      'File storage is not configured',
      'documents.errors.storageNotConfigured',
    );
  }

  try {
    const signed = await storage.createDownloadUrl(document.storagePath);
    return {
      url: signed.url,
      expiresAt: signed.expiresAt,
      filename: document.originalFilename,
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

export async function softDeleteDocument(
  context: OrgContext,
  rawInput: { documentId: string },
): Promise<DocumentRecord> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const parsed = documentIdSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findDocumentById(context.db, context.organizationId, parsed.data.documentId);
  if (!existing) throw new NotFoundError('Document');
  await assertCanReadStoredDocument(context, existing);

  const storage = getStoragePort();
  const updated = await updateDocumentById(context.db, context.organizationId, parsed.data.documentId, {
    status: 'deleted',
    deletedAt: new Date(),
    ...(storage.configured ? { storageCleanupStatus: 'pending' as const } : {}),
  });
  if (!updated) throw new NotFoundError('Document');

  let result: DocumentRecord = updated;
  if (storage.configured) {
    const removal = await removeStorageObjectWithRetry((key) => storage.remove(key), existing.storagePath);
    const flagged = await updateDocumentById(
      context.db,
      context.organizationId,
      parsed.data.documentId,
      buildCleanupPatch(updated, removal, existing.checksum),
    );
    if (flagged) result = flagged;

    if (!removal.ok) {
      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.DOCUMENT_STORAGE_CLEANUP_FAILED,
        entityType: 'document',
        entityId: result.id,
        before: { status: existing.status, checksum: existing.checksum },
        after: {
          status: result.status,
          checksum: result.checksum,
          storageCleanupStatus: result.storageCleanupStatus,
          storageCleanupFailed: true,
        },
        metadata: {
          storagePath: existing.storagePath,
          attempts: removal.attempts,
          error: removal.error,
        },
      });
    }
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DOCUMENT_DELETED,
    entityType: 'document',
    entityId: result.id,
    before: existing,
    after: result,
  });

  return result;
}

export async function retryFailedDocumentCleanups(
  context: OrgContext,
  options: { limit?: number } = {},
): Promise<StorageCleanupRetryResult> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const storage = getStoragePort();
  if (!storage.configured) {
    return { attempted: 0, succeeded: 0, failed: 0, succeededIds: [], failedIds: [] };
  }

  const candidates = await listDeletedDocumentsNeedingStorageCleanup(
    context.db,
    context.organizationId,
    { limit: options.limit },
  );

  const succeededIds: string[] = [];
  const failedIds: string[] = [];

  for (const document of candidates) {
    const removal = await removeStorageObjectWithRetry((key) => storage.remove(key), document.storagePath);
    const patch = buildCleanupPatch(document, removal, document.checksum);
    await updateDocumentById(context.db, context.organizationId, document.id, patch);

    if (removal.ok) {
      const restoredChecksum = restoreChecksumIfOrphanEncoded(document.checksum);
      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.DOCUMENT_STORAGE_CLEANUP_COMPLETED,
        entityType: 'document',
        entityId: document.id,
        before: {
          checksum: document.checksum,
          storageCleanupStatus: document.storageCleanupStatus,
          storageCleanupFailed: true,
        },
        after: {
          status: document.status,
          checksum: restoredChecksum,
          storageCleanupStatus: 'succeeded',
          storageCleanupFailed: false,
        },
        metadata: { storagePath: document.storagePath, attempts: removal.attempts },
      });
      succeededIds.push(document.id);
      continue;
    }

    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.DOCUMENT_STORAGE_CLEANUP_FAILED,
      entityType: 'document',
      entityId: document.id,
      before: {
        checksum: document.checksum,
        storageCleanupStatus: document.storageCleanupStatus,
        storageCleanupFailed: true,
      },
      after: {
        status: document.status,
        checksum: restoreChecksumIfOrphanEncoded(document.checksum),
        storageCleanupStatus: 'failed',
        storageCleanupFailed: true,
      },
      metadata: {
        storagePath: document.storagePath,
        attempts: removal.attempts,
        error: removal.error,
      },
    });
    failedIds.push(document.id);
  }

  return {
    attempted: candidates.length,
    succeeded: succeededIds.length,
    failed: failedIds.length,
    succeededIds,
    failedIds,
  };
}

function buildCleanupPatch(
  document: Pick<DocumentRecord, 'storageCleanupAttempts' | 'checksum'>,
  removal: { ok: boolean; attempts: number; error?: string },
  originalChecksum: string | null,
): {
  storageCleanupStatus: StorageCleanupStatus;
  storageCleanupAttempts: number;
  storageCleanupError: string | null;
  storageCleanupLastAttemptedAt: Date;
  checksum?: string | null;
} {
  const patch: {
    storageCleanupStatus: StorageCleanupStatus;
    storageCleanupAttempts: number;
    storageCleanupError: string | null;
    storageCleanupLastAttemptedAt: Date;
    checksum?: string | null;
  } = {
    storageCleanupStatus: removal.ok ? 'succeeded' : 'failed',
    storageCleanupAttempts: document.storageCleanupAttempts + removal.attempts,
    storageCleanupError: removal.ok ? null : truncateStorageCleanupError(removal.error ?? 'unknown'),
    storageCleanupLastAttemptedAt: new Date(),
  };

  if (isStorageOrphanChecksum(originalChecksum)) {
    patch.checksum = restoreChecksumIfOrphanEncoded(originalChecksum);
  }

  return patch;
}
