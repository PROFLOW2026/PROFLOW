import 'server-only';

import { createHash } from 'node:crypto';
import { findDocumentById } from '@/modules/documents';
import { runCommittedStorageWrite } from '@/modules/external-storage/server';
import {
  organizationHasActiveStorage,
  resolveValidAccessToken,
} from '@/modules/external-storage/application/connection-service';
import { resolveProjectScopedUploadFolderId } from '@/modules/external-storage/application/project-upload-folder';
import { ensureUsablePrimaryStorageConnection } from '@/modules/external-storage/application/reconcile-primary-storage';
import { findStorageConnectionById } from '@/modules/external-storage/data/connections.repository';
import { getStorageProviderAdapter } from '@/modules/external-storage/providers/registry';
import { parseByteRangeHeader } from '@/modules/external-storage/server/byte-range';
import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import { DomainRuleError, NotFoundError, ServiceUnavailableError } from '@/shared/errors';
import type { ProjectFileDeps, ProjectFileStore, StoredFile } from './application/file-store';

/**
 * Production adapter: the org's primary external storage connection (OneDrive / Google Drive /
 * Dropbox / Box). Writes land in the project's semantic folder; reads stream from the provider.
 * Runs on the committed service-role connection because contractors (and project members without
 * the org-wide documents permission) never hold storage credentials - authorization happened in
 * the use-case before this adapter is reached.
 */

async function usableConnection(db: DbExecutor, organizationId: string) {
  const connection = await ensureUsablePrimaryStorageConnection(db, organizationId);
  if (!connection || !organizationHasActiveStorage(connection)) {
    throw new ServiceUnavailableError('Organization storage is not connected', 'externalStorage.errors.notConnected');
  }
  return connection;
}

/** `resolveProjectScopedUploadFolderId` only reads `db` + `organizationId` from its context. */
function storageScope(db: DbExecutor, organizationId: string): OrgContext {
  return { db, organizationId } as unknown as OrgContext;
}

export const externalProviderFileStore: ProjectFileStore = {
  async resolveConnection(organizationId) {
    const connection = await runCommittedStorageWrite((db) => usableConnection(db, organizationId));
    return { connectionId: connection.id, provider: connection.provider };
  },

  async put(input) {
    return runCommittedStorageWrite(async (db): Promise<StoredFile> => {
      const connection = await usableConnection(db, input.organizationId);
      const accessToken = await resolveValidAccessToken(db, input.organizationId, connection);
      const parentFolderId = await resolveProjectScopedUploadFolderId(storageScope(db, input.organizationId), {
        connection,
        accessToken,
        projectId: input.projectId,
        semanticFolderType: input.folder,
      });
      const uploaded = await getStorageProviderAdapter(connection.provider).uploadFile(accessToken, {
        parentFolderId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        body: input.bytes,
        sizeBytes: input.bytes.length,
      });
      return {
        connectionId: connection.id,
        provider: connection.provider,
        externalFileId: uploaded.id,
        externalParentFolderId: parentFolderId,
        etag: uploaded.etag ?? null,
        sizeBytes: uploaded.sizeBytes ?? input.bytes.length,
        checksum: createHash('sha256').update(input.bytes).digest('hex'),
      };
    });
  },

  async open(input) {
    const resolved = await runCommittedStorageWrite(async (db) => {
      const document = await findDocumentById(db, input.organizationId, input.documentId);
      if (!document || document.status !== 'available' || document.deletedAt) throw new NotFoundError('Document');
      if (document.storageBackend !== 'external' || !document.externalConnectionId || !document.externalFileId) {
        throw new DomainRuleError('Not an external document', 'documents.errors.notAvailable');
      }
      const connection = await findStorageConnectionById(db, input.organizationId, document.externalConnectionId);
      if (!connection || connection.status !== 'connected') {
        throw new ServiceUnavailableError('Storage disconnected', 'externalStorage.errors.fileUnavailable');
      }
      const accessToken = await resolveValidAccessToken(db, input.organizationId, connection);
      return { document, connection, accessToken };
    });
    const adapter = getStorageProviderAdapter(resolved.connection.provider);
    const sizeBytes = resolved.document.sizeBytes ?? null;
    let byteRange: { start: number; end: number } | undefined;
    if (input.rangeHeader && sizeBytes && sizeBytes > 0) {
      const parsed = parseByteRangeHeader(input.rangeHeader, sizeBytes);
      if (parsed && parsed !== 'unsatisfiable') byteRange = parsed;
    }
    const downloaded = await adapter.downloadFileStream(resolved.accessToken, resolved.document.externalFileId!, {
      byteRange,
    });
    return {
      stream: downloaded.stream,
      mimeType: downloaded.mimeType || resolved.document.mimeType,
      sizeBytes: downloaded.sizeBytes ?? sizeBytes,
      httpStatus: downloaded.httpStatus ?? (byteRange ? 206 : 200),
      contentRange: downloaded.contentRange ?? null,
    };
  },
};

export const projectFileDeps: ProjectFileDeps = {
  store: externalProviderFileStore,
  elevated: runCommittedStorageWrite,
};
