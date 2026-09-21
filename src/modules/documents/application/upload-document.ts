import { randomUUID } from 'node:crypto';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError, ServiceUnavailableError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { serverEnv } from '@/shared/env/server';
import {
  assertOrganizationStorageAvailable,
  isOrganizationStorageConfigured,
  resolveUploadFolderEntityContext,
  semanticFolderForDocumentOwner,
} from '@/modules/external-storage/server';
import { noteModuleUsage } from '@/modules/tenancy';
import { resolveAccessibleProjectIds } from '@/modules/projects/application/project-access';
import { validateUploadConstraints } from '../domain/file-rules';
import { resolveUploadPrivacyClass } from '../domain/privacy';
import type { DocumentListFilters, DocumentListItem, PrepareUploadResult } from '../domain/types';
import {
  flushDocumentCurrentVersionGuards,
  insertDocument,
  insertDocumentLink,
  listAllDocuments,
  listDocumentsForEntity,
  updateDocumentById,
} from '../data/documents.repository';
import { documentOwnerExistsInOrganization } from '../data/verify-document-owner';
import { listDocumentsSchema, listEntityDocumentsSchema, prepareUploadSchema, type PrepareUploadInput } from '../validation/schemas';
import {
  assertCanListEntityDocuments,
  assertDocumentManagePermission,
  canReadCompensationDocuments,
} from './document-visibility';

const EXTERNAL_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;

export async function isStorageConfigured(context: OrgContext): Promise<boolean> {
  return isOrganizationStorageConfigured(context);
}

/** @deprecated Use isStorageConfigured(context) — kept for legacy call sites during migration. */
export function isStorageConfiguredSync(): boolean {
  return false;
}

export async function prepareDocumentUpload(
  context: OrgContext,
  rawInput: PrepareUploadInput,
): Promise<PrepareUploadResult> {
  const parsed = prepareUploadSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;

  await assertDocumentManagePermission(context, {
    ownerType: input.ownerType,
    ownerId: input.ownerId,
  });

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

  await assertCanListEntityDocuments(context, input.ownerType, input.ownerId);

  let connection;
  try {
    connection = await assertOrganizationStorageAvailable(context);
  } catch {
    throw new ServiceUnavailableError(
      'Organization storage is not connected',
      'externalStorage.errors.notConnected',
    );
  }

  const documentId = randomUUID();
  const semanticFolder = semanticFolderForDocumentOwner(input.ownerType, input.label);
  const folderEntity = await resolveUploadFolderEntityContext(
    context.db,
    context.organizationId,
    input.ownerType,
    input.ownerId,
  );
  const placeholderPath = `pending://${documentId}`;

  const document = await insertDocument(context.db, {
    id: documentId,
    organizationId: context.organizationId,
    storageBucket: `external:${connection.provider}`,
    storagePath: placeholderPath,
    originalFilename: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    uploadedByUserId: context.userId,
    privacyClass: resolveUploadPrivacyClass({
      ownerType: input.ownerType,
      requested: input.privacyClass,
      canReadWorkforceCost: canReadCompensationDocuments(context),
    }),
  });

  await updateDocumentById(context.db, context.organizationId, document.id, {
    storageBackend: 'external',
    externalConnectionId: connection.id,
  });

  await flushDocumentCurrentVersionGuards(context.db);

  await insertDocumentLink(context.db, {
    organizationId: context.organizationId,
    documentId: document.id,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    label: input.label ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'documents');

  const baseUrl = serverEnv().APP_URL.replace(/\/+$/, '');
  const uploadParams = new URLSearchParams({
    semantic: semanticFolder,
    entityType: folderEntity.entityType ?? input.ownerType,
    entityId: folderEntity.entityId ?? input.ownerId,
  });
  if (input.browserParentFolderId) {
    uploadParams.set('parentFolderId', input.browserParentFolderId);
  }
  const uploadUrl = `${baseUrl}/api/org-storage/upload/${document.id}?${uploadParams.toString()}`;

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
    entityType: 'document',
    entityId: document.id,
    after: {
      id: document.id,
      filename: document.originalFilename,
      ownerType: input.ownerType,
      storageBackend: 'external',
      semanticFolder,
    },
  });

  return {
    document: { ...document, storageBackend: 'external', externalConnectionId: connection.id, externalFileId: null, externalParentFolderId: null, externalEtag: null },
    uploadMode: 'external',
    uploadUrl,
    uploadToken: null,
    uploadPath: document.id,
    uploadBucket: `external:${connection.provider}`,
    uploadExpiresAt: new Date(Date.now() + EXTERNAL_UPLOAD_TTL_MS),
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

  const accessibleProjectIds = await resolveAccessibleProjectIds(context);
  if (parsed.data.projectId && accessibleProjectIds !== null) {
    if (!accessibleProjectIds.includes(parsed.data.projectId)) {
      return [];
    }
  }

  return listAllDocuments(context.db, context.organizationId, {
    ...parsed.data,
    includeCompensation: canReadCompensationDocuments(context),
    accessibleProjectIds,
  });
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

  await assertCanListEntityDocuments(context, parsed.data.ownerType, parsed.data.ownerId);

  return listDocumentsForEntity(context.db, context.organizationId, {
    ...parsed.data,
    includeCompensation: canReadCompensationDocuments(context),
  });
}
