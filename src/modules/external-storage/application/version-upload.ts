import 'server-only';

import { createHash } from 'node:crypto';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { findDocumentById } from '@/modules/documents';
import { NotFoundError } from '@/shared/errors';
import type { ProviderFileItem } from '../domain/types';
import { insertStorageFile } from '../data/files.repository';
import { updateDocumentById } from '@/modules/documents';
import { assertOrganizationStorageAvailable, resolveValidAccessToken } from './connection-service';
import { getStorageProviderAdapter } from '../providers/registry';
import { findFolderMapping } from '../data/folder-mappings.repository';

/** Upload bytes for a new document version (document already available). */
export async function uploadDocumentVersionToExternalStorage(
  context: OrgContext,
  input: {
    documentId: string;
    versionNumber: number;
    fileName: string;
    mimeType: string;
    body: ReadableStream<Uint8Array> | Uint8Array;
    sizeBytes: number;
  },
): Promise<ProviderFileItem> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const connection = await assertOrganizationStorageAvailable(context);
  const document = await findDocumentById(context.db, context.organizationId, input.documentId);
  if (!document || document.status !== 'available') {
    throw new NotFoundError('Document');
  }

  const parentFolderId =
    document.externalParentFolderId ??
    (await findFolderMapping(context.db, {
      organizationId: context.organizationId,
      connectionId: connection.id,
      semanticFolderType: 'documents',
    }))?.externalFolderId ??
    connection.rootFolderExternalId;

  if (!parentFolderId) throw new NotFoundError('Folder');

  const accessToken = await resolveValidAccessToken(context.db, context.organizationId, connection);
  const adapter = getStorageProviderAdapter(connection.provider);
  const uploaded = await adapter.uploadFile(accessToken, {
    parentFolderId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    body: input.body,
    sizeBytes: input.sizeBytes,
  });

  const bytes =
    input.body instanceof Uint8Array
      ? input.body
      : await new Response(input.body).arrayBuffer().then((b) => new Uint8Array(b));
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
    externalFileId: uploaded.id,
    externalEtag: uploaded.etag,
    storagePath: uploaded.id,
  });

  return uploaded;
}
