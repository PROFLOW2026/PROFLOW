import 'server-only';

import {
  findStorageConnectionById,
  getStorageProviderAdapter,
  resolveValidAccessToken,
  runCommittedStorageWrite,
} from '@/modules/external-storage/server';
import { openStorageSecret, sealStorageSecret } from '@/modules/external-storage/application/token-seal';
import { resolveProjectScopedUploadFolderId } from '@/modules/external-storage/application/project-upload-folder';
import type { OrgContext } from '@/shared/auth/context';
import { ServiceUnavailableError } from '@/shared/errors';
import { tryEnsureLocationFolder } from './application/folders';
import { createVideoRelay } from './application/video-relay';
import { buildRuntime, infraFileStore, usableConnection } from './server';

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
      const runtime = await buildRuntime(db, { organizationId: input.organizationId, projectId: input.projectId });
      let parentFolderId = await tryEnsureLocationFolder(runtime.context, input.locationId).catch(() => null);
      if (!parentFolderId) {
        parentFolderId = await resolveProjectScopedUploadFolderId(
          { db, organizationId: input.organizationId } as unknown as OrgContext,
          {
            connection: runtime.connection,
            accessToken: runtime.accessToken,
            projectId: input.projectId,
            semanticFolderType: 'photos',
          },
        );
      }
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
