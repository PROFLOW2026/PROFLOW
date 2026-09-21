import 'server-only';

import { getClientDetail } from '@/modules/clients';
import { findProjectById } from '@/modules/projects';
import type { DbExecutor } from '@/shared/db/types';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import {
  findStorageFileByExternalId,
  findStorageFileByParentAndName,
  insertStorageFile,
  updateStorageFileByExternalId,
} from '../data/files.repository';
import {
  buildProjectInfoText,
  formatStoredClientAddress,
  preferredClientRegistration,
  PROJECT_INFO_FILE_NAME,
} from '../domain/project-info-text';
import type { StorageConnectionRecord } from '../domain/types';
import { getStorageProviderAdapter } from '../providers/registry';

export async function upsertProjectInfoFile(
  db: DbExecutor,
  input: {
    organizationId: string;
    connection: StorageConnectionRecord;
    accessToken: string;
    projectId: string;
    projectFolderId: string;
  },
): Promise<void> {
  const project = await findProjectById(db, input.organizationId, input.projectId);
  if (!project) return;

  const client = project.clientId
    ? await getClientDetail(db, input.organizationId, project.clientId)
    : null;
  const contact = client
    ? (client.contacts.find((row) => row.id === project.primaryContactId) ??
      client.contacts.find((row) => row.role === 'primary') ??
      client.contacts[0] ??
      null)
    : null;

  const text = buildProjectInfoText({
    projectNumber: project.documentNumber,
    projectName: project.name,
    projectStatus: project.status,
    location: project.location,
    startDate: project.startDate,
    description: project.description,
    notes: project.notes,
    clientName: client?.name ?? null,
    clientRegistration: client ? preferredClientRegistration(client.identifiers) : null,
    contactName: contact?.name ?? null,
    phone: contact?.phone ?? client?.phone ?? null,
    email: contact?.email ?? client?.email ?? null,
    clientAddress: formatStoredClientAddress(client),
  });
  const body = new TextEncoder().encode(text);
  const adapter = getStorageProviderAdapter(input.connection.provider);
  const listing = await adapter.listFolder(input.accessToken, input.projectFolderId);
  const existingProviderFile =
    listing.files.find((file) => file.name === PROJECT_INFO_FILE_NAME) ?? null;
  const recorded = await asServiceRoleWrite(db, () =>
    findStorageFileByParentAndName(db, {
      organizationId: input.organizationId,
      connectionId: input.connection.id,
      externalParentFolderId: input.projectFolderId,
      originalFilename: PROJECT_INFO_FILE_NAME,
    }),
  );
  const existingId = existingProviderFile?.id ?? recorded?.externalFileId ?? null;

  const uploaded = existingId
    ? await adapter.replaceFileContent(input.accessToken, {
        fileId: existingId,
        parentFolderId: input.projectFolderId,
        fileName: PROJECT_INFO_FILE_NAME,
        mimeType: 'text/plain',
        body,
      })
    : await adapter.uploadFile(input.accessToken, {
        parentFolderId: input.projectFolderId,
        fileName: PROJECT_INFO_FILE_NAME,
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
        externalParentFolderId: input.projectFolderId,
        originalFilename: PROJECT_INFO_FILE_NAME,
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
      externalParentFolderId: input.projectFolderId,
      originalFilename: PROJECT_INFO_FILE_NAME,
      mimeType: 'text/plain',
      sizeBytes: body.byteLength,
      status: 'synced',
    }),
  );
}
