import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ServiceUnavailableError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findDocumentById, updateDocumentById } from '@/modules/documents';
import type { SemanticFolderType } from '@drizzle/schema/external-storage';
import type { ProviderFileItem } from '../domain/types';
import {
  findStorageFileByDocumentId,
  findStorageFileByExternalId,
  updateStorageFile,
  updateStorageFileByExternalId,
} from '../data/files.repository';
import { getStorageProviderAdapter } from '../providers/registry';
import {
  assertOrganizationStorageAvailable,
  resolveValidAccessToken,
} from './connection-service';
import { moveProjectStorageItem } from './browser-service';
import { resolveProjectScopedUploadFolderId } from './project-upload-folder';

async function syncDocumentAfterMove(
  context: OrgContext,
  connectionId: string,
  documentId: string,
  previousExternalFileId: string,
  updated: ProviderFileItem,
  fallbackParentFolderId: string,
): Promise<void> {
  const parentFolderId = updated.parentId ?? fallbackParentFolderId;
  const idChanged = updated.id !== previousExternalFileId;

  const storageFile =
    (await findStorageFileByDocumentId(context.db, context.organizationId, documentId)) ??
    (await findStorageFileByExternalId(
      context.db,
      context.organizationId,
      connectionId,
      previousExternalFileId,
    ));

  if (!storageFile) return;

  const storagePatch = {
    originalFilename: updated.name,
    externalParentFolderId: parentFolderId,
    externalEtag: updated.etag,
    ...(updated.sizeBytes !== undefined ? { sizeBytes: updated.sizeBytes } : {}),
    ...(updated.mimeType !== undefined ? { mimeType: updated.mimeType } : {}),
    ...(idChanged ? { externalFileId: updated.id } : {}),
  };

  if (idChanged) {
    await updateStorageFile(context.db, context.organizationId, storageFile.id, storagePatch);
  } else {
    await updateStorageFileByExternalId(
      context.db,
      context.organizationId,
      connectionId,
      previousExternalFileId,
      storagePatch,
    );
  }

  await updateDocumentById(context.db, context.organizationId, documentId, {
    originalFilename: updated.name,
    externalParentFolderId: parentFolderId,
    externalEtag: updated.etag,
    ...(updated.sizeBytes !== undefined ? { sizeBytes: updated.sizeBytes } : {}),
    ...(idChanged ? { externalFileId: updated.id, storagePath: updated.id } : {}),
  });
}

/**
 * Relocate a canonical document into a project semantic folder via provider moveFile().
 * Applies full ProviderFileItem metadata to documents + storage_files — never re-uploads bytes.
 */
export async function relocateDocumentToSemanticFolder(
  context: OrgContext,
  input: {
    documentId: string;
    projectId: string;
    semanticFolderType: SemanticFolderType;
  },
): Promise<ProviderFileItem> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const document = await findDocumentById(context.db, context.organizationId, input.documentId);
  if (!document || document.status === 'deleted') {
    throw new NotFoundError('Document');
  }
  if (!document.externalFileId) {
    throw new ServiceUnavailableError(
      'Document is not stored externally',
      'externalStorage.errors.fileUnavailable',
    );
  }

  const connection = await assertOrganizationStorageAvailable(context);
  const accessToken = await resolveValidAccessToken(context.db, context.organizationId, connection);
  const targetFolderExternalId = await resolveProjectScopedUploadFolderId(context, {
    connection,
    accessToken,
    projectId: input.projectId,
    semanticFolderType: input.semanticFolderType,
  });

  try {
    const moved = await moveProjectStorageItem(context, {
      projectId: input.projectId,
      itemId: document.externalFileId,
      itemKind: 'file',
      targetFolderExternalId,
    });
    if (!('mimeType' in moved)) {
      throw new DomainRuleError('Expected file move result', 'externalStorage.errors.fileUnavailable');
    }
    return moved;
  } catch {
    const adapter = getStorageProviderAdapter(connection.provider);
    const updated = await adapter.moveFile(
      accessToken,
      document.externalFileId,
      targetFolderExternalId,
    );
    await syncDocumentAfterMove(
      context,
      connection.id,
      document.id,
      document.externalFileId,
      updated,
      targetFolderExternalId,
    );
    return updated;
  }
}
