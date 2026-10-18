import 'server-only';

import { z } from 'zod';
import {
  organizationHasActiveStorage,
  resolveValidAccessToken,
} from '@/modules/external-storage/application/connection-service';
import { ensureUsablePrimaryStorageConnection } from '@/modules/external-storage/application/reconcile-primary-storage';
import {
  findStorageFileByDocumentId,
  findStorageFileByExternalId,
} from '@/modules/external-storage/data/files.repository';
import { listFolderMappingsForProject } from '@/modules/external-storage/data/folder-mappings.repository';
import { runCommittedStorageWrite } from '@/modules/external-storage/data/storage-admin-write';
import type { SemanticFolderType } from '@/modules/external-storage/domain/types';
import { getStorageProviderAdapter } from '@/modules/external-storage/providers/registry';
import { findDocumentById } from '@/modules/documents';
import type { OpenedFile } from '@/modules/evidence';
import { projectFileDeps } from '@/modules/evidence/server';
import { parseByteRangeHeader } from '@/modules/external-storage/server/byte-range';
import { requireExternalProjectCapability } from '@/modules/project-plans/application/shared';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import { NotFoundError, ServiceUnavailableError } from '@/shared/errors';
import { type ExternalCapability, type ExternalContext } from '@/shared/external';
import {
  capabilityForContractorFolder,
  CONTRACTOR_SEMANTIC_FOLDER_CAPABILITY,
} from '../domain/folder-capabilities';

const uuid = z.string().uuid();

export interface ContractorFolderFileItem {
  /** Present when the provider file is linked to a ProjectFlow document. */
  readonly documentId: string | null;
  readonly externalFileId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number | null;
  readonly folder: SemanticFolderType;
}

export interface ContractorFolderListing {
  readonly folder: SemanticFolderType;
  readonly folderName: string;
  readonly folderExternalId: string;
  readonly files: readonly ContractorFolderFileItem[];
  readonly subfolders: readonly { readonly id: string; readonly name: string }[];
}

function assertFolderCapability(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
  folder: SemanticFolderType,
): ExternalCapability {
  const capability = capabilityForContractorFolder(folder);
  if (!capability) throw new NotFoundError('Folder');
  requireExternalProjectCapability(context, { organizationId, projectId }, capability);
  return capability;
}

async function assertUnderSemanticRoot(input: {
  accessToken: string;
  adapter: ReturnType<typeof getStorageProviderAdapter>;
  rootExternalId: string;
  targetFolderId: string;
}): Promise<void> {
  if (input.targetFolderId === input.rootExternalId) return;
  let current = input.targetFolderId;
  for (let depth = 0; depth < 32; depth++) {
    if (current === input.rootExternalId) return;
    const folder = await input.adapter.getFolder(input.accessToken, current);
    if (!folder?.parentId) break;
    current = folder.parentId;
  }
  throw new NotFoundError('Folder');
}

/**
 * Lists files in a project semantic folder the contractor may open via grant capability.
 * Authorization = existing ext.* capability mapped to the folder (not a new permission model).
 */
export async function listContractorSemanticFolder(
  context: ExternalContext,
  raw: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly folder: SemanticFolderType;
    readonly folderExternalId?: string | null;
  },
): Promise<ContractorFolderListing> {
  const organizationId = uuid.parse(raw.organizationId);
  const projectId = uuid.parse(raw.projectId);
  assertFolderCapability(context, organizationId, projectId, raw.folder);

  return runCommittedStorageWrite(async (db) => {
    const connection = await ensureUsablePrimaryStorageConnection(db, organizationId);
    if (!connection || !organizationHasActiveStorage(connection)) {
      throw new ServiceUnavailableError(
        'Organization storage is not connected',
        'externalStorage.errors.notConnected',
      );
    }
    const mappings = await listFolderMappingsForProject(
      db,
      organizationId,
      connection.id,
      projectId,
    );
    const root = mappings.find(
      (mapping) => mapping.semanticFolderType === raw.folder && mapping.status === 'ready',
    );
    if (!root?.externalFolderId) {
      return {
        folder: raw.folder,
        folderName: raw.folder,
        folderExternalId: '',
        files: [],
        subfolders: [],
      };
    }

    const accessToken = await resolveValidAccessToken(db, organizationId, connection);
    const adapter = getStorageProviderAdapter(connection.provider);
    const targetFolderId = raw.folderExternalId?.trim() || root.externalFolderId;
    await assertUnderSemanticRoot({
      accessToken,
      adapter,
      rootExternalId: root.externalFolderId,
      targetFolderId,
    });

    const listing = await adapter.listFolder(accessToken, targetFolderId);
    const folderMeta =
      targetFolderId === root.externalFolderId
        ? { name: root.displayName }
        : await adapter.getFolder(accessToken, targetFolderId);

    const files: ContractorFolderFileItem[] = [];
    for (const file of listing.files) {
      const linked = await asServiceRoleWrite(db, () =>
        findStorageFileByExternalId(db, organizationId, connection.id, file.id),
      );
      files.push({
        documentId: linked?.documentId ?? null,
        externalFileId: file.id,
        fileName: file.name,
        mimeType: file.mimeType ?? linked?.mimeType ?? 'application/octet-stream',
        sizeBytes: file.sizeBytes ?? linked?.sizeBytes ?? null,
        folder: raw.folder,
      });
    }

    return {
      folder: raw.folder,
      folderName: folderMeta?.name ?? root.displayName,
      folderExternalId: targetFolderId,
      files,
      subfolders: listing.folders.map((folder) => ({ id: folder.id, name: folder.name })),
    };
  });
}

export async function listContractorAllowedFolderRoots(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
): Promise<readonly { readonly folder: SemanticFolderType; readonly capability: ExternalCapability }[]> {
  const orgId = uuid.parse(organizationId);
  const projId = uuid.parse(projectId);
  const allowed: { folder: SemanticFolderType; capability: ExternalCapability }[] = [];
  for (const folder of Object.keys(CONTRACTOR_SEMANTIC_FOLDER_CAPABILITY) as SemanticFolderType[]) {
    const capability = capabilityForContractorFolder(folder);
    if (!capability) continue;
    try {
      requireExternalProjectCapability(context, { organizationId: orgId, projectId: projId }, capability);
      allowed.push({ folder, capability });
    } catch {
      // grant missing for this folder only
    }
  }
  return allowed;
}

async function resolveDocumentFolderType(
  organizationId: string,
  projectId: string,
  documentId: string,
): Promise<{ folderType: SemanticFolderType; fileName: string; mimeType: string } | null> {
  return runCommittedStorageWrite(async (db) => {
    const connection = await ensureUsablePrimaryStorageConnection(db, organizationId);
    if (!connection) return null;
    const document = await asServiceRoleWrite(db, () => findDocumentById(db, organizationId, documentId));
    if (!document || document.status !== 'available' || document.deletedAt) return null;
    const storageFile = await asServiceRoleWrite(db, () =>
      findStorageFileByDocumentId(db, organizationId, documentId),
    );
    if (!storageFile?.externalParentFolderId) return null;

    const mappings = await listFolderMappingsForProject(
      db,
      organizationId,
      connection.id,
      projectId,
    );
    const ready = mappings.filter((m) => m.status === 'ready');
    const byExternal = new Map(ready.map((m) => [m.externalFolderId, m]));
    let folderType: SemanticFolderType | null =
      byExternal.get(storageFile.externalParentFolderId)?.semanticFolderType ?? null;

    if (!folderType || folderType === 'project_root') {
      const accessToken = await resolveValidAccessToken(db, organizationId, connection);
      const adapter = getStorageProviderAdapter(connection.provider);
      let current = storageFile.externalParentFolderId;
      for (let depth = 0; depth < 32; depth++) {
        const mapped = byExternal.get(current);
        if (mapped && mapped.semanticFolderType !== 'project_root') {
          folderType = mapped.semanticFolderType;
          break;
        }
        const folder = await adapter.getFolder(accessToken, current);
        if (!folder?.parentId) break;
        current = folder.parentId;
      }
    }
    if (!folderType || folderType === 'project_root') return null;
    return {
      folderType,
      fileName: document.originalFilename,
      mimeType: document.mimeType,
    };
  });
}

export async function openContractorFolderDocument(
  context: ExternalContext,
  raw: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly documentId: string;
    readonly rangeHeader?: string | null;
  },
): Promise<OpenedFile & { fileName: string }> {
  const organizationId = uuid.parse(raw.organizationId);
  const projectId = uuid.parse(raw.projectId);
  const documentId = uuid.parse(raw.documentId);
  const location = await resolveDocumentFolderType(organizationId, projectId, documentId);
  if (!location) throw new NotFoundError('Document');
  assertFolderCapability(context, organizationId, projectId, location.folderType);

  const opened = await projectFileDeps.store.open({
    organizationId,
    documentId,
    rangeHeader: raw.rangeHeader,
  });
  return { ...opened, mimeType: location.mimeType ?? opened.mimeType, fileName: location.fileName };
}

/** Download a provider file inside an allowed semantic folder (linked or unlinked). */
export async function openContractorFolderProviderFile(
  context: ExternalContext,
  raw: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly folder: SemanticFolderType;
    readonly externalFileId: string;
    readonly rangeHeader?: string | null;
  },
): Promise<OpenedFile & { fileName: string }> {
  const organizationId = uuid.parse(raw.organizationId);
  const projectId = uuid.parse(raw.projectId);
  assertFolderCapability(context, organizationId, projectId, raw.folder);

  return runCommittedStorageWrite(async (db) => {
    const connection = await ensureUsablePrimaryStorageConnection(db, organizationId);
    if (!connection || !organizationHasActiveStorage(connection)) {
      throw new ServiceUnavailableError(
        'Organization storage is not connected',
        'externalStorage.errors.notConnected',
      );
    }
    const mappings = await listFolderMappingsForProject(
      db,
      organizationId,
      connection.id,
      projectId,
    );
    const root = mappings.find(
      (mapping) => mapping.semanticFolderType === raw.folder && mapping.status === 'ready',
    );
    if (!root?.externalFolderId) throw new NotFoundError('File');

    const accessToken = await resolveValidAccessToken(db, organizationId, connection);
    const adapter = getStorageProviderAdapter(connection.provider);
    const meta = await adapter.getFileMetadata(accessToken, raw.externalFileId);
    if (!meta?.parentId) throw new NotFoundError('File');
    await assertUnderSemanticRoot({
      accessToken,
      adapter,
      rootExternalId: root.externalFolderId,
      targetFolderId: meta.parentId,
    });

    const linked = await asServiceRoleWrite(db, () =>
      findStorageFileByExternalId(db, organizationId, connection.id, raw.externalFileId),
    );
    if (linked?.documentId) {
      const opened = await projectFileDeps.store.open({
        organizationId,
        documentId: linked.documentId,
        rangeHeader: raw.rangeHeader,
      });
      return { ...opened, fileName: meta.name, mimeType: meta.mimeType ?? opened.mimeType };
    }

    const sizeBytes = meta.sizeBytes ?? null;
    let byteRange: { start: number; end: number } | undefined;
    if (raw.rangeHeader && sizeBytes && sizeBytes > 0) {
      const parsed = parseByteRangeHeader(raw.rangeHeader, sizeBytes);
      if (parsed && parsed !== 'unsatisfiable') byteRange = parsed;
    }
    const downloaded = await adapter.downloadFileStream(accessToken, raw.externalFileId, {
      byteRange,
      knownMeta: meta,
    });
    return {
      stream: downloaded.stream,
      mimeType: downloaded.mimeType || meta.mimeType || 'application/octet-stream',
      sizeBytes: downloaded.sizeBytes ?? sizeBytes,
      httpStatus: downloaded.httpStatus ?? (byteRange ? 206 : 200),
      contentRange: downloaded.contentRange ?? null,
      fileName: meta.name,
    };
  });
}
