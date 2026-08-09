import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError, ServiceUnavailableError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { getStoragePort, StorageNotConfiguredError } from '@/shared/ports/storage';
import { validateUploadConstraints } from '../domain/file-rules';
import type { DocumentRecord, DownloadUrlResult } from '../domain/types';
import {
  findDocumentById,
  updateDocumentById,
} from '../data/documents.repository';
import {
  documentIdSchema,
  finalizeUploadSchema,
  type FinalizeUploadInput,
} from '../validation/schemas';

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

  const updated = await updateDocumentById(context.db, context.organizationId, parsed.data.documentId, {
    status: 'available',
    sizeBytes: parsed.data.sizeBytes,
    checksum: parsed.data.checksum ?? null,
  });

  if (!updated) throw new NotFoundError('Document');

  await recordAuditEvent(context, {
    action: 'document.finalized',
    entityType: 'document',
    entityId: updated.id,
    before: { status: existing.status },
    after: { status: updated.status, sizeBytes: updated.sizeBytes },
  });

  return updated;
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

  const updated = await updateDocumentById(context.db, context.organizationId, parsed.data.documentId, {
    status: 'deleted',
    deletedAt: new Date(),
  });
  if (!updated) throw new NotFoundError('Document');

  const storage = getStoragePort();
  if (storage.configured) {
    try {
      await storage.remove(existing.storagePath);
    } catch {
      // Metadata deletion is authoritative; storage cleanup can be repaired later.
    }
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DOCUMENT_DELETED,
    entityType: 'document',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}
