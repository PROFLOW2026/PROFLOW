import 'server-only';

import { getClientDetail } from '@/modules/clients/data/clients.repository';
import type { DbExecutor } from '@/shared/db/types';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import {
  findStorageFileByExternalId,
  findStorageFileByParentAndName,
  insertStorageFile,
  updateStorageFileByExternalId,
} from '../data/files.repository';
import {
  buildClientInfoText,
  CLIENT_INFO_FILE_NAME,
  formatStoredClientAddress,
  preferredClientRegistration,
} from '../domain/project-info-text';
import type { StorageConnectionRecord } from '../domain/types';
import { getStorageProviderAdapter } from '../providers/registry';

export async function upsertClientInfoFile(
  db: DbExecutor,
  input: {
    organizationId: string;
    connection: StorageConnectionRecord;
    accessToken: string;
    clientId: string;
    clientFolderId: string;
  },
): Promise<void> {
  const client = await getClientDetail(db, input.organizationId, input.clientId);
  if (!client) return;

  const contact =
    client.contacts.find((row) => row.role === 'primary') ?? client.contacts[0] ?? null;

  const text = buildClientInfoText({
    clientName: client.name,
    clientRegistration: preferredClientRegistration(client.identifiers),
    contactName: contact?.name ?? null,
    phone: contact?.phone ?? client.phone ?? null,
    email: contact?.email ?? client.email ?? null,
    clientAddress: formatStoredClientAddress(client),
    notes: client.notes,
  });
  const body = new TextEncoder().encode(text);
  const adapter = getStorageProviderAdapter(input.connection.provider);
  const listing = await adapter.listFolder(input.accessToken, input.clientFolderId);
  const existingProviderFile =
    listing.files.find((file) => file.name === CLIENT_INFO_FILE_NAME) ?? null;
  const recorded = await asServiceRoleWrite(db, () =>
    findStorageFileByParentAndName(db, {
      organizationId: input.organizationId,
      connectionId: input.connection.id,
      externalParentFolderId: input.clientFolderId,
      originalFilename: CLIENT_INFO_FILE_NAME,
    }),
  );
  const existingId = existingProviderFile?.id ?? recorded?.externalFileId ?? null;

  const uploaded = existingId
    ? await adapter.replaceFileContent(input.accessToken, {
        fileId: existingId,
        parentFolderId: input.clientFolderId,
        fileName: CLIENT_INFO_FILE_NAME,
        mimeType: 'text/plain',
        body,
      })
    : await adapter.uploadFile(input.accessToken, {
        parentFolderId: input.clientFolderId,
        fileName: CLIENT_INFO_FILE_NAME,
        mimeType: 'text/plain',
        body,
        sizeBytes: body.byteLength,
      });

  const prior = recorded ?? (existingId
    ? await asServiceRoleWrite(db, () =>
        findStorageFileByExternalId(db, input.organizationId, input.connection.id, existingId),
      )
    : null);
  if (prior) {
    await asServiceRoleWrite(db, () =>
      updateStorageFileByExternalId(db, input.organizationId, input.connection.id, prior.externalFileId, {
        externalFileId: uploaded.id,
        externalParentFolderId: input.clientFolderId,
        originalFilename: CLIENT_INFO_FILE_NAME,
        mimeType: 'text/plain',
        sizeBytes: body.byteLength,
        status: 'synced',
        lastError: null,
      }),
    );
    return;
  }

  await asServiceRoleWrite(db, () =>
    insertStorageFile(db, {
      organizationId: input.organizationId,
      connectionId: input.connection.id,
      externalFileId: uploaded.id,
      externalParentFolderId: input.clientFolderId,
      originalFilename: CLIENT_INFO_FILE_NAME,
      mimeType: 'text/plain',
      sizeBytes: body.byteLength,
      status: 'synced',
    }),
  );
}
