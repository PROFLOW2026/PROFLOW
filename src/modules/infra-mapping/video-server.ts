import 'server-only';

import {
  findStorageConnectionById,
  getStorageProviderAdapter,
  resolveValidAccessToken,
  runCommittedStorageWrite,
} from '@/modules/external-storage/server';
import { openStorageSecret, sealStorageSecret } from '@/modules/external-storage/application/token-seal';
import { DomainRuleError, NotFoundError, ServiceUnavailableError } from '@/shared/errors';
import { ensureLocationFolder } from './application/folders';
import { createVideoRelay } from './application/video-relay';
import { buildRuntime, infraFileStore, usableConnection, withFolderLock } from './server';

/**
 * Production wiring of the video relay: the organization's primary storage connection, reached
 * through the existing provider adapters on the committed service-role connection. It only runs
 * AFTER the use-case authorized the caller; the browser never receives a token or provider URL.
 */
export const infraVideoPort = createVideoRelay({
  seal: (plaintext) => sealStorageSecret(plaintext),
  open: (sealed) => openStorageSecret(sealed),
  now: () => Date.now(),

  async supportsChunked(organizationId) {
    const connection = await runCommittedStorageWrite((db) => usableConnection(db, organizationId));
    return Boolean(getStorageProviderAdapter(connection.provider).resumableUpload);
  },

  putSingle(input) {
    return infraFileStore.put({
      organizationId: input.organizationId,
      projectId: input.projectId,
      documentId: input.documentId,
      folder: 'photos',
      fileName: input.fileName,
      mimeType: input.mimeType,
      bytes: input.bytes,
    });
  },

  startTarget(input) {
    return runCommittedStorageWrite(async (db) => {
      const scope = { organizationId: input.organizationId, projectId: input.projectId };
      const runtime = await buildRuntime(db, scope);
      // Lazy, strict: the location's folder is created on the first upload; a failure surfaces (no other folder).
      const parentFolderId = await withFolderLock(db, scope, () => ensureLocationFolder(runtime.context, input.locationId)).catch(
        (error: unknown) => {
          if (error instanceof DomainRuleError || error instanceof ServiceUnavailableError || error instanceof NotFoundError) {
            throw error;
          }
          throw new ServiceUnavailableError('Location folder could not be created', 'infraMapping.errors.folderCreate');
        },
      );
      return {
        connectionId: runtime.connection.id,
        provider: runtime.connection.provider,
        accessToken: runtime.accessToken,
        uploader: getStorageProviderAdapter(runtime.connection.provider).resumableUpload ?? null,
        parentFolderId,
      };
    });
  },

  existingTarget(input) {
    return runCommittedStorageWrite(async (db) => {
      const connection = await findStorageConnectionById(db, input.organizationId, input.connectionId);
      if (!connection || connection.status !== 'connected') {
        throw new ServiceUnavailableError('Storage disconnected', 'externalStorage.errors.fileUnavailable');
      }
      const accessToken = await resolveValidAccessToken(db, input.organizationId, connection);
      return {
        connectionId: connection.id,
        provider: connection.provider,
        accessToken,
        uploader: getStorageProviderAdapter(connection.provider).resumableUpload ?? null,
      };
    });
  },
});
