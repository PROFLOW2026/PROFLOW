import { randomUUID } from 'node:crypto';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError, ServiceUnavailableError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { getStoragePort, StorageNotConfiguredError } from '@/shared/ports/storage';
import { noteModuleUsage } from '@/modules/tenancy';
import { validateUploadConstraints } from '../domain/file-rules';
import type { DocumentListFilters, DocumentListItem, PrepareUploadResult } from '../domain/types';
import {
  insertDocument,
  insertDocumentLink,
  listAllDocuments,
  listDocumentsForEntity,
  updateDocumentById,
} from '../data/documents.repository';
import { documentOwnerExistsInOrganization } from '../data/verify-document-owner';
import { listDocumentsSchema, listEntityDocumentsSchema, prepareUploadSchema, type PrepareUploadInput } from '../validation/schemas';

const DEFAULT_BUCKET = 'documents';

export function isStorageConfigured(): boolean {
  return getStoragePort().configured;
}

export async function prepareDocumentUpload(
  context: OrgContext,
  rawInput: PrepareUploadInput,
): Promise<PrepareUploadResult> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const parsed = prepareUploadSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const validation = validateUploadConstraints({
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });
  if (!validation.valid) {
    throw new DomainRuleError(
      validation.reason === 'mime' ? 'File type is not allowed' : 'File is too large',
      validation.reason === 'mime' ? 'documents.errors.mimeNotAllowed' : 'documents.errors.fileTooLarge',
    );
  }

  const ownerExists = await documentOwnerExistsInOrganization(
    context.db,
    context.organizationId,
    input.ownerType,
    input.ownerId,
  );
  if (!ownerExists) {
    throw new NotFoundError('Document owner');
  }

  const storage = getStoragePort();
  if (!storage.configured) {
    throw new ServiceUnavailableError(
      'File storage is not configured',
      'documents.errors.storageNotConfigured',
    );
  }

  const documentId = randomUUID();
  const storagePath = storage.buildKey({
    organizationId: context.organizationId,
    entityType: 'documents',
    entityId: documentId,
    fileName: input.fileName,
  });

  const document = await insertDocument(context.db, {
    id: documentId,
    organizationId: context.organizationId,
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? DEFAULT_BUCKET,
    storagePath,
    originalFilename: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    uploadedByUserId: context.userId,
  });

  await insertDocumentLink(context.db, {
    organizationId: context.organizationId,
    documentId: document.id,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    label: input.label ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'documents');

  let signed;
  try {
    signed = await storage.createUploadUrl(storagePath, input.mimeType);
  } catch (error) {
    await updateDocumentById(context.db, context.organizationId, document.id, {
      status: 'deleted',
      deletedAt: new Date(),
    });
    if (error instanceof StorageNotConfiguredError) {
      throw new ServiceUnavailableError(
        'File storage is not configured',
        'documents.errors.storageNotConfigured',
      );
    }
    throw error;
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
    entityType: 'document',
    entityId: document.id,
    after: { id: document.id, filename: document.originalFilename, ownerType: input.ownerType },
  });

  return {
    document,
    uploadUrl: signed.url,
    uploadToken: signed.token,
    uploadPath: signed.path,
    uploadBucket: document.storageBucket,
    uploadExpiresAt: signed.expiresAt,
  };
}

export async function listDocumentsForOrg(
  context: OrgContext,
  rawFilters: DocumentListFilters = {},
): Promise<DocumentListItem[]> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);

  const parsed = listDocumentsSchema.safeParse(rawFilters);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  return listAllDocuments(context.db, context.organizationId, parsed.data);
}

export async function listEntityDocuments(
  context: OrgContext,
  rawInput: { ownerType: PrepareUploadInput['ownerType']; ownerId: string },
): Promise<DocumentListItem[]> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);

  const parsed = listEntityDocumentsSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  return listDocumentsForEntity(context.db, context.organizationId, parsed.data);
}
