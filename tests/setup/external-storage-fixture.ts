import { createHash, randomUUID } from 'node:crypto';
import { organizationStorageConnections } from '@drizzle/schema';
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import { findDocumentById, updateDocumentById } from '@/modules/documents/data/documents.repository';
import { getPrimaryStorageConnection } from '@/modules/external-storage/data/connections.repository';
import { insertStorageFile } from '@/modules/external-storage/data/files.repository';
import * as externalStorageServer from '@/modules/external-storage/server';
import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';

export async function seedOrganizationStorageConnection(
  db: DbExecutor,
  organizationId: string,
  connectedByUserId: string,
): Promise<string> {
  const connectionId = randomUUID();
  await db.insert(organizationStorageConnections).values({
    id: connectionId,
    organizationId,
    provider: 'onedrive',
    status: 'connected',
    isPrimary: true,
    externalAccountId: 'integration-test-account',
    externalAccountName: 'Integration Test',
    externalAccountEmail: 'storage-integration@test.example',
    rootFolderExternalId: 'integration-root-folder',
    rootFolderName: 'ProjectFlow',
    scopesJson: [],
    connectedByUserId,
    connectedAt: new Date(),
    lastValidatedAt: new Date(),
  });
  return connectionId;
}

export async function simulateExternalStorageUpload(
  context: OrgContext,
  input: {
    documentId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    body: Uint8Array;
  },
): Promise<{ id: string }> {
  const connection = await getPrimaryStorageConnection(context.db, context.organizationId);
  if (!connection) throw new Error('missing test storage connection');

  const fileId = `test-ext-${input.documentId}`;
  const checksum = createHash('sha256').update(input.body).digest('hex');

  await insertStorageFile(context.db, {
    organizationId: context.organizationId,
    connectionId: connection.id,
    documentId: input.documentId,
    externalFileId: fileId,
    externalParentFolderId: connection.rootFolderExternalId,
    originalFilename: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    externalEtag: 'test-etag',
    checksum,
    createdByUserId: context.userId,
  });

  await updateDocumentById(context.db, context.organizationId, input.documentId, {
    storageBackend: 'external',
    externalConnectionId: connection.id,
    externalFileId: fileId,
    externalParentFolderId: connection.rootFolderExternalId,
    externalEtag: 'test-etag',
    storageBucket: `external:${connection.provider}`,
    storagePath: fileId,
  });

  return { id: fileId };
}

export function installExternalStorageServerMocks(): {
  uploadSpy: Mock;
  downloadSpy: Mock;
} {
  const uploadSpy = vi
    .spyOn(externalStorageServer, 'uploadDocumentToExternalStorage')
    .mockImplementation(async (context, input) => {
      const body =
        input.body instanceof Uint8Array
          ? input.body
          : await new Response(input.body).arrayBuffer().then((buffer) => new Uint8Array(buffer));
      const uploaded = await simulateExternalStorageUpload(context, {
        documentId: input.documentId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        body,
      });
      return {
        id: uploaded.id,
        name: input.fileName,
        parentId: null,
        etag: 'test-etag',
        sizeBytes: input.sizeBytes,
        mimeType: input.mimeType,
        modifiedAt: new Date(),
      };
    });

  const downloadSpy = vi
    .spyOn(externalStorageServer, 'getExternalDocumentDownload')
    .mockImplementation(async (context, documentId) => {
      const document = await findDocumentById(context.db, context.organizationId, documentId);
      if (!document) throw new Error('missing document');
      return {
        url: `https://storage.test/download/${encodeURIComponent(document.storagePath)}`,
        filename: document.originalFilename,
        mimeType: document.mimeType,
      };
    });

  return { uploadSpy, downloadSpy };
}

export function restoreExternalStorageServerMocks(): void {
  vi.restoreAllMocks();
}
