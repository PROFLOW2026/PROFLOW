import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { externalProviderFileStore } from '@/modules/evidence/server';
import type { ProjectFileDeps, StoredFile } from '@/modules/evidence';
import { findDocumentById, updateDocumentById } from '@/modules/documents';
import {
  ensureUsablePrimaryStorageConnection,
  findStorageFileByDocumentId,
  getStorageProviderAdapter,
  organizationHasActiveStorage,
  resolveValidAccessToken,
  runCommittedStorageWrite,
  updateStorageFile,
  type StorageConnectionRecord,
} from '@/modules/external-storage/server';
import { ensureProjectFolderTree } from '@/modules/external-storage/application/folder-provisioning';
import { provisionStoredProjectFolder } from '@/modules/external-storage/application/project-provision';
import { resolveProjectScopedUploadFolderId } from '@/modules/external-storage/application/project-upload-folder';
import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import { DomainRuleError, NotFoundError, ServiceUnavailableError } from '@/shared/errors';
import {
  findEvidenceLocationByDocument,
  insertFolderMappingRow,
  listFolderMappingRows,
  listLocationNodes,
  updateFolderMappingRow,
  deleteFolderMappingRow,
  type FolderMappingRow,
} from './data/infra.repository';
import {
  ensureLocationFolder,
  linkExistingFolder,
  moveLocationFolder,
  renameLocationFolder,
  syncLocationFolders,
  tryEnsureLocationFolder,
  type FolderAdapter,
  type FolderContext,
  type FolderMappingStore,
} from './application/folders';
import type { InfraDeps, InfraFolderPort } from './application/ports';
import { resolveProjectFolderId, type InfraProjectSnapshot } from './application/project-folder';
import { describeFolderFailure, type FolderStage } from './domain/folder-failure';
import { logger } from '@/shared/observability/logger';

/**
 * Production wiring for infrastructure mapping: the organization's primary external storage
 * connection (OneDrive / Google Drive / Dropbox / Box), reached through the existing provider
 * adapters. Everything here runs on the committed service-role connection AFTER the use-case has
 * authorized the caller - contractors and employees never hold storage credentials of their own.
 */

export async function usableConnection(db: DbExecutor, organizationId: string): Promise<StorageConnectionRecord> {
  const connection = await ensureUsablePrimaryStorageConnection(db, organizationId);
  if (!connection || !organizationHasActiveStorage(connection)) {
    throw new ServiceUnavailableError('Organization storage is not connected', 'externalStorage.errors.notConnected');
  }
  return connection;
}

function adapterFor(connection: StorageConnectionRecord, accessToken: string): FolderAdapter {
  const provider = getStorageProviderAdapter(connection.provider);
  return {
    async getFolder(folderId) {
      const folder = await provider.getFolder(accessToken, folderId);
      return folder ? { id: folder.id, name: folder.name, parentId: folder.parentId } : null;
    },
    async findChildByName(parentId, name) {
      // The folder listing is the proven path (same as project folder provisioning) and is matched on the
      // exact name. A provider-side name filter is only a fallback, and its answer is verified: some
      // providers ignore the filter and return an unrelated folder, which must never be adopted.
      const listing = await provider.listFolder(accessToken, parentId);
      const listed = listing.folders.find((folder) => folder.name === name);
      if (listed) return { id: listed.id, name: listed.name, parentId: listed.parentId ?? parentId };
      if (provider.getChildFolderByName) {
        const found = await provider.getChildFolderByName(accessToken, parentId, name);
        if (found && found.name === name) return { id: found.id, name: found.name, parentId: found.parentId ?? parentId };
      }
      return null;
    },
    async createFolder(input) {
      const created = await provider.createFolder(accessToken, { name: input.name, parentId: input.parentId });
      return { id: created.id, name: created.name, parentId: created.parentId ?? input.parentId };
    },
    async renameFolder(folderId, name) {
      const renamed = await provider.renameFolder(accessToken, folderId, name);
      return { id: renamed.id, name: renamed.name, parentId: renamed.parentId };
    },
    async moveFolder(folderId, newParentId) {
      const moved = await provider.moveFolder(accessToken, folderId, newParentId);
      return { id: moved.id, name: moved.name, parentId: moved.parentId ?? newParentId };
    },
  };
}

function mappingStore(
  db: DbExecutor,
  scope: { organizationId: string; projectId: string; connectionId: string; userId: string | null },
): FolderMappingStore {
  return {
    list: () => listFolderMappingRows(db, scope.organizationId, scope.projectId, scope.connectionId),
    async insert(row) {
      const now = new Date();
      const record: FolderMappingRow = {
        id: randomUUID(),
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        connectionId: scope.connectionId,
        locationId: row.locationId,
        externalFolderId: row.externalFolderId,
        externalParentId: row.externalParentId,
        displayName: row.displayName,
        origin: row.origin,
        status: row.status,
        lastError: row.lastError,
        lastVerifiedAt: now,
        createdByUserId: scope.userId,
        createdAt: now,
        updatedAt: now,
      };
      await insertFolderMappingRow(db, record);
      return record;
    },
    async update(mappingId, patch) {
      await updateFolderMappingRow(db, scope.organizationId, mappingId, patch);
    },
    async remove(mappingId) {
      await deleteFolderMappingRow(db, scope.organizationId, mappingId);
    },
  };
}

interface FolderRuntime {
  readonly context: FolderContext;
  readonly connection: StorageConnectionRecord;
  readonly accessToken: string;
}

export async function buildRuntime(
  db: DbExecutor,
  input: { organizationId: string; projectId: string; userId?: string | null; project?: InfraProjectSnapshot | null },
  onStage?: (stage: FolderStage) => void,
): Promise<FolderRuntime> {
  onStage?.('connection');
  const connection = await usableConnection(db, input.organizationId);
  onStage?.('token');
  const accessToken = await resolveValidAccessToken(db, input.organizationId, connection);
  onStage?.('project_folder');
  const resolved = await resolveProjectFolderId({
    provision: () =>
      provisionStoredProjectFolder(db, {
        organizationId: input.organizationId,
        connection,
        accessToken,
        projectId: input.projectId,
      }),
    snapshot: input.project,
    ensureFromSnapshot: (project) =>
      ensureProjectFolderTree(db, {
        organizationId: input.organizationId,
        connection,
        accessToken,
        projectId: project.id,
        projectName: project.name,
        documentNumber: project.documentNumber,
        clientId: project.clientId,
        clientName: project.clientName,
      }),
  });
  if (!resolved) {
    logger.error('infra.project_folder_unresolved', {
      organizationId: input.organizationId,
      projectId: input.projectId,
      hadSnapshot: Boolean(input.project),
    });
    throw new DomainRuleError('Project folder is unavailable', 'infraMapping.errors.projectFolder');
  }
  if (resolved.source === 'snapshot') {
    // The trusted read of the project row came back empty; worth knowing if it ever repeats.
    logger.warn('infra.project_read_empty_under_service_role', {
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
  }
  const projectFolderId = resolved.folderId;
  onStage?.('locations');
  const nodes = await listLocationNodes(db, input.organizationId, input.projectId);
  return {
    connection,
    accessToken,
    context: {
      adapter: adapterFor(connection, accessToken),
      store: mappingStore(db, {
        organizationId: input.organizationId,
        projectId: input.projectId,
        connectionId: connection.id,
        userId: input.userId ?? null,
      }),
      projectFolderId,
      tree: nodes.map((node) => ({ id: node.id, parentId: node.parentId, name: node.name, code: node.code, archived: node.archived })),
    },
  };
}

export const infraFolderPort: InfraFolderPort = {
  async createLocationFolder(input) {
    let stage: FolderStage = 'connection';
    try {
      const folderId = await runCommittedStorageWrite(async (db) => {
        const runtime = await buildRuntime(db, input, (next) => {
          stage = next;
        });
        stage = 'folder';
        // Strict: unlike the upload path, a failure here must surface (nothing may look synced).
        return ensureLocationFolder(runtime.context, input.locationId);
      });
      return { ok: true, folderId };
    } catch (error) {
      const failure = describeFolderFailure(stage, error);
      logger.error('infra.location_folder_failed', {
        stage: failure.stage,
        code: failure.code,
        organizationId: input.organizationId,
        projectId: input.projectId,
        locationId: input.locationId,
        errorName: error instanceof Error ? error.name : typeof error,
        providerStatus:
          error instanceof Error && error.name === 'ProviderHttpError' ? (error as { status?: number }).status : undefined,
        providerBody:
          error instanceof Error && error.name === 'ProviderHttpError'
            ? String((error as { bodySnippet?: string }).bodySnippet ?? '').slice(0, 200)
            : undefined,
      });
      return { ok: false, stage: failure.stage, code: failure.code };
    }
  },

  resolveLocationFolder(input) {
    return runCommittedStorageWrite(async (db) => {
      const runtime = await buildRuntime(db, input);
      return tryEnsureLocationFolder(runtime.context, input.locationId);
    });
  },

  syncFolders(input) {
    return runCommittedStorageWrite(async (db) => {
      const runtime = await buildRuntime(db, { ...input, userId: input.createdByUserId });
      return syncLocationFolders(runtime.context, { locationIds: input.locationIds ?? null, batchSize: input.batchSize });
    });
  },

  renameFolder(input) {
    return runCommittedStorageWrite(async (db) => {
      const runtime = await buildRuntime(db, input);
      return renameLocationFolder(runtime.context, input.locationId);
    });
  },

  moveFolder(input) {
    return runCommittedStorageWrite(async (db) => {
      const runtime = await buildRuntime(db, input);
      return moveLocationFolder(runtime.context, input.locationId);
    });
  },

  async linkFolder(input) {
    await runCommittedStorageWrite(async (db) => {
      const runtime = await buildRuntime(db, { ...input, userId: input.createdByUserId });
      await linkExistingFolder(runtime.context, { locationId: input.locationId, externalFolderId: input.externalFolderId });
    });
  },

  async relocateFiles(input) {
    if (input.documentIds.length === 0) return;
    await runCommittedStorageWrite(async (db) => {
      const runtime = await buildRuntime(db, input);
      const folderId = await ensureLocationFolder(runtime.context, input.locationId);
      const provider = getStorageProviderAdapter(runtime.connection.provider);
      for (const documentId of input.documentIds) {
        const document = await findDocumentById(db, input.organizationId, documentId);
        if (!document || document.status === 'deleted' || !document.externalFileId) continue;
        if (document.externalParentFolderId === folderId) continue;
        const moved = await provider.moveFile(runtime.accessToken, document.externalFileId, folderId);
        const idChanged = moved.id !== document.externalFileId;
        const storageFile = await findStorageFileByDocumentId(db, input.organizationId, documentId);
        if (storageFile) {
          await updateStorageFile(db, input.organizationId, storageFile.id, {
            externalParentFolderId: moved.parentId ?? folderId,
            externalEtag: moved.etag,
            ...(idChanged ? { externalFileId: moved.id } : {}),
          });
        }
        await updateDocumentById(db, input.organizationId, documentId, {
          externalParentFolderId: moved.parentId ?? folderId,
          externalEtag: moved.etag,
          ...(idChanged ? { externalFileId: moved.id, storagePath: moved.id } : {}),
        });
      }
    });
  },

  writeSidecar(input) {
    return runCommittedStorageWrite(async (db) => {
      const runtime = await buildRuntime(db, input);
      const folderId = await ensureLocationFolder(runtime.context, input.locationId);
      const body = new TextEncoder().encode(input.json);
      const uploaded = await getStorageProviderAdapter(runtime.connection.provider).uploadFile(runtime.accessToken, {
        parentFolderId: folderId,
        fileName: input.fileName,
        mimeType: 'application/json',
        body,
        sizeBytes: body.length,
      });
      return { connectionId: runtime.connection.id, externalFileId: uploaded.id };
    });
  },

  providerWebUrl(input) {
    return runCommittedStorageWrite(async (db) => {
      const document = await findDocumentById(db, input.organizationId, input.documentId);
      if (!document || document.status !== 'available' || !document.externalFileId) throw new NotFoundError('Document');
      const connection = await usableConnection(db, input.organizationId);
      const accessToken = await resolveValidAccessToken(db, input.organizationId, connection);
      const provider = getStorageProviderAdapter(connection.provider);
      if (!provider.getProviderWebUrl) return null;
      return provider.getProviderWebUrl(accessToken, document.externalFileId);
    });
  },
};

/**
 * Evidence store that writes infrastructure photos straight into the folder of their location
 * (falling back to the project's regular photos folder when the location folder cannot be
 * resolved, so an upload is never lost because of a folder problem).
 */
export const infraFileStore: ProjectFileDeps['store'] = {
  resolveConnection: externalProviderFileStore.resolveConnection,
  open: externalProviderFileStore.open,
  async put(input) {
    const targetLocation = await runCommittedStorageWrite((db) =>
      findEvidenceLocationByDocument(db, input.organizationId, input.documentId),
    );
    if (!targetLocation) return externalProviderFileStore.put(input);
    return runCommittedStorageWrite(async (db): Promise<StoredFile> => {
      const runtime = await buildRuntime(db, { organizationId: input.organizationId, projectId: input.projectId });
      let parentFolderId = await tryEnsureLocationFolder(runtime.context, targetLocation).catch(() => null);
      if (!parentFolderId) {
        parentFolderId = await resolveProjectScopedUploadFolderId(
          { db, organizationId: input.organizationId } as unknown as OrgContext,
          {
            connection: runtime.connection,
            accessToken: runtime.accessToken,
            projectId: input.projectId,
            semanticFolderType: input.folder,
          },
        );
      }
      const uploaded = await getStorageProviderAdapter(runtime.connection.provider).uploadFile(runtime.accessToken, {
        parentFolderId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        body: input.bytes,
        sizeBytes: input.bytes.length,
      });
      return {
        connectionId: runtime.connection.id,
        provider: runtime.connection.provider,
        externalFileId: uploaded.id,
        externalParentFolderId: parentFolderId,
        etag: uploaded.etag ?? null,
        sizeBytes: uploaded.sizeBytes ?? input.bytes.length,
        checksum: createHash('sha256').update(input.bytes).digest('hex'),
      };
    });
  },
};

/** True when the organization has an active, usable cloud connection (the same check folders use). */
export async function isInfraStorageConnected(organizationId: string): Promise<boolean> {
  try {
    return await runCommittedStorageWrite(async (db) => {
      const connection = await ensureUsablePrimaryStorageConnection(db, organizationId);
      return Boolean(connection && organizationHasActiveStorage(connection));
    });
  } catch {
    return false;
  }
}

export const infraDeps: InfraDeps = {
  files: { store: infraFileStore, elevated: runCommittedStorageWrite },
  folders: infraFolderPort,
};
