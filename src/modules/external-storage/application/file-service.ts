import 'server-only';

import { createHash } from 'node:crypto';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError, ServiceUnavailableError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { findDocumentById, updateDocumentById } from '@/modules/documents';
import type { SemanticFolderType } from '@drizzle/schema/external-storage';
import { insertStorageFile, findStorageFileByDocumentId, updateStorageFile } from '../data/files.repository';
import { findFolderMapping } from '../data/folder-mappings.repository';
import type { ProviderFileItem, ProviderFolderListing, StorageConnectionRecord } from '../domain/types';
import { ProviderHttpError } from '../providers/http-utils';
import { getStorageProviderAdapter } from '../providers/registry';
import {
  assertOrganizationStorageAvailable,
  resolveValidAccessToken,
} from './connection-service';
import { resolveSemanticFolderDisplayName } from '../domain/semantic-folders';
import { resolveUploadFolderId } from './folder-provisioning';
import { assertProjectBrowserUploadFolder } from './browser-service';
import { resolveUploadFolderEntityContext } from './resolve-upload-folder-context';
import { findPrimaryDocumentLink } from '@/modules/documents';

export async function uploadDocumentToExternalStorage(
  context: OrgContext,
  input: {
    documentId: string;
    parentSemanticFolder: SemanticFolderType;
    entityType?: string | null;
    entityId?: string | null;
    parentFolderExternalId?: string | null;
    /** Pre-resolved upload folder (generated artifacts, nested paths). Skips semantic lookup. */
    resolvedParentFolderId?: string | null;
    fileName: string;
    mimeType: string;
    body: ReadableStream<Uint8Array> | Uint8Array;
    sizeBytes: number;
  },
): Promise<ProviderFileItem> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const connection = await assertOrganizationStorageAvailable(context);
  const document = await findDocumentById(context.db, context.organizationId, input.documentId);
  if (!document || document.status !== 'pending') {
    throw new NotFoundError('Document');
  }

  const accessToken = await resolveValidAccessToken(context.db, context.organizationId, connection);

  const documentLink = await findPrimaryDocumentLink(
    context.db,
    context.organizationId,
    input.documentId,
  );
  const folderEntity = documentLink
    ? await resolveUploadFolderEntityContext(
        context.db,
        context.organizationId,
        documentLink.ownerType,
        documentLink.ownerId,
      )
    : {
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      };
  const folderEntityType = folderEntity.entityType ?? input.entityType;
  const folderEntityId = folderEntity.entityId ?? input.entityId;

  let parentFolderId: string | undefined;
  if (input.resolvedParentFolderId?.trim()) {
    parentFolderId = input.resolvedParentFolderId.trim();
  } else if (input.parentFolderExternalId?.trim()) {
    if (folderEntityType !== 'project' || !folderEntityId) {
      throw new DomainRuleError(
        'Browser upload folder requires project scope',
        'externalStorage.errors.outOfScope',
      );
    }
    await assertProjectBrowserUploadFolder(context, {
      projectId: folderEntityId,
      parentFolderExternalId: input.parentFolderExternalId.trim(),
    });
    parentFolderId = input.parentFolderExternalId.trim();
  }

  const parentMapping = parentFolderId
    ? null
    : await findFolderMapping(context.db, {
        organizationId: context.organizationId,
        connectionId: connection.id,
        semanticFolderType: input.parentSemanticFolder,
        entityType: folderEntityType,
        entityId: folderEntityId,
      });

  if (!parentFolderId) {
    parentFolderId = parentMapping?.externalFolderId;
  }
  if (!parentFolderId || (!input.parentFolderExternalId && parentMapping?.status !== 'ready')) {
    const projectRoot = folderEntityType === 'project' && folderEntityId
      ? await findFolderMapping(context.db, {
          organizationId: context.organizationId,
          connectionId: connection.id,
          semanticFolderType: 'project_root',
          entityType: 'project',
          entityId: folderEntityId,
        })
      : null;
    parentFolderId = await resolveUploadFolderId(context.db, {
      organizationId: context.organizationId,
      connection,
      accessToken,
      semanticFolderType: input.parentSemanticFolder,
      entityType: folderEntityType,
      entityId: folderEntityId,
      parentFolderId: projectRoot?.externalFolderId ?? connection.rootFolderExternalId ?? undefined,
      displayName: resolveSemanticFolderDisplayName(input.parentSemanticFolder),
    });
  }

  const bytes =
    input.body instanceof Uint8Array
      ? input.body
      : await new Response(input.body).arrayBuffer().then((b) => new Uint8Array(b));

  const adapter = getStorageProviderAdapter(connection.provider);
  let uploaded: ProviderFileItem;
  try {
    uploaded = await adapter.uploadFile(accessToken, {
      parentFolderId: parentFolderId!,
      fileName: input.fileName,
      mimeType: input.mimeType,
      body: bytes,
      sizeBytes: bytes.length,
    });
  } catch (error) {
    if (error instanceof ProviderHttpError && error.isQuotaExceeded()) {
      throw new ServiceUnavailableError(
        'External storage quota exceeded',
        'externalStorage.errors.quotaFull',
      );
    }
    throw error;
  }

  const checksum = createHash('sha256').update(bytes).digest('hex');

  await insertStorageFile(context.db, {
    organizationId: context.organizationId,
    connectionId: connection.id,
    documentId: document.id,
    externalFileId: uploaded.id,
    externalParentFolderId: parentFolderId,
    originalFilename: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: uploaded.sizeBytes ?? input.sizeBytes,
    externalEtag: uploaded.etag,
    checksum,
    createdByUserId: context.userId,
  });

  await updateDocumentById(context.db, context.organizationId, document.id, {
    storageBackend: 'external',
    externalConnectionId: connection.id,
    externalFileId: uploaded.id,
    externalParentFolderId: parentFolderId,
    externalEtag: uploaded.etag,
    storageBucket: `external:${connection.provider}`,
    storagePath: uploaded.id,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.STORAGE_FILE_UPLOADED,
    entityType: 'storage_file',
    entityId: document.id,
    after: { externalFileId: uploaded.id, provider: connection.provider },
  });

  return uploaded;
}

export async function getExternalFileDownload(
  context: OrgContext,
  input: {
    connectionId: string;
    externalFileId: string;
    filename: string;
    mimeType: string;
    documentId?: string;
  },
): Promise<{ url: string; filename: string; mimeType: string } | { stream: ReadableStream<Uint8Array>; filename: string; mimeType: string }> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);

  const { findStorageConnectionById } = await import('../data/connections.repository');
  const connection = await findStorageConnectionById(
    context.db,
    context.organizationId,
    input.connectionId,
  );
  if (!connection || connection.status !== 'connected') {
    throw new ServiceUnavailableError(
      'Storage disconnected',
      'externalStorage.errors.fileUnavailable',
    );
  }

  const accessToken = await resolveValidAccessToken(context.db, context.organizationId, connection);
  const adapter = getStorageProviderAdapter(connection.provider);
  const meta = await adapter.getFileMetadata(accessToken, input.externalFileId);
  if (!meta) {
    if (input.documentId) {
      const storageFile = await findStorageFileByDocumentId(
        context.db,
        context.organizationId,
        input.documentId,
      );
      if (storageFile) {
        await updateStorageFile(context.db, context.organizationId, storageFile.id, {
          status: 'missing',
          lastError: 'externally_deleted',
        });
      }
    }
    throw new ServiceUnavailableError(
      'File missing in provider',
      'externalStorage.errors.fileUnavailable',
    );
  }

  if (adapter.getProviderWebUrl) {
    const webUrl = await adapter.getProviderWebUrl(accessToken, input.externalFileId);
    if (webUrl) {
      return {
        url: webUrl,
        filename: input.filename,
        mimeType: input.mimeType,
      };
    }
  }

  const downloaded = await adapter.downloadFileStream(accessToken, input.externalFileId);
  return {
    stream: downloaded.stream,
    filename: input.filename,
    mimeType: downloaded.mimeType,
  };
}

export async function getExternalDocumentDownload(
  context: OrgContext,
  documentId: string,
): Promise<{ url: string; filename: string; mimeType: string } | { stream: ReadableStream<Uint8Array>; filename: string; mimeType: string }> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const document = await findDocumentById(context.db, context.organizationId, documentId);
  if (!document || document.status !== 'available') {
    throw new NotFoundError('Document');
  }

  if (document.storageBackend !== 'external' || !document.externalConnectionId || !document.externalFileId) {
    throw new DomainRuleError('Not an external document', 'documents.errors.notAvailable');
  }

  return getExternalFileDownload(context, {
    connectionId: document.externalConnectionId,
    externalFileId: document.externalFileId,
    filename: document.originalFilename,
    mimeType: document.mimeType,
    documentId: document.id,
  });
}

export async function listProjectStorageFolder(
  context: OrgContext,
  input: {
    projectId: string;
    semanticFolderType: SemanticFolderType;
  },
): Promise<ProviderFolderListing> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const connection = await assertOrganizationStorageAvailable(context);
  const mapping = await findFolderMapping(context.db, {
    organizationId: context.organizationId,
    connectionId: connection.id,
    semanticFolderType: input.semanticFolderType,
    entityType: 'project',
    entityId: input.projectId,
  });
  if (!mapping || mapping.status !== 'ready') {
    return { folders: [], files: [] };
  }

  const accessToken = await resolveValidAccessToken(context.db, context.organizationId, connection);
  const adapter = getStorageProviderAdapter(connection.provider);
  return adapter.listFolder(accessToken, mapping.externalFolderId);
}

export async function refreshExternalFileMetadata(
  context: OrgContext,
  documentId: string,
): Promise<void> {
  const document = await findDocumentById(context.db, context.organizationId, documentId);
  if (!document?.externalConnectionId || !document.externalFileId) return;

  const storageFile = await findStorageFileByDocumentId(context.db, context.organizationId, documentId);
  const { findStorageConnectionById } = await import('../data/connections.repository');
  const connection = await findStorageConnectionById(
    context.db,
    context.organizationId,
    document.externalConnectionId,
  );
  if (!connection) return;

  try {
    const accessToken = await resolveValidAccessToken(context.db, context.organizationId, connection);
    const adapter = getStorageProviderAdapter(connection.provider);
    const meta = await adapter.getFileMetadata(accessToken, document.externalFileId);
    if (!meta) {
      if (storageFile) {
        await updateStorageFile(context.db, context.organizationId, storageFile.id, {
          status: 'missing',
          lastError: 'externally_deleted',
        });
      }
      return;
    }
    await updateDocumentById(context.db, context.organizationId, documentId, {
      originalFilename: meta.name,
      sizeBytes: meta.sizeBytes,
      externalEtag: meta.etag,
    });
    if (storageFile) {
      await updateStorageFile(context.db, context.organizationId, storageFile.id, {
        originalFilename: meta.name,
        sizeBytes: meta.sizeBytes,
        externalEtag: meta.etag,
        status: 'synced',
        lastError: null,
      });
    }
  } catch {
    // Best-effort metadata refresh on browse.
  }
}

export function externalStorageBucket(connection: StorageConnectionRecord): string {
  return `external:${connection.provider}`;
}
