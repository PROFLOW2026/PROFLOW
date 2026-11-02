import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
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
import { provisionStoredProjectFolder } from '@/modules/external-storage/application/project-provision';
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
  FOLDER_MISSING,
  ensureLocationFolder,
  inspectLocationFolder,
  linkExistingFolder,
  moveLocationFolder,
  recreateMissingFolder,
  renameLocationFolder,
  resolveFolderDrift,
  syncLocationFolders,
  type FolderAdapter,
  type FolderContext,
  type FolderMappingStore,
} from './application/folders';
import type { InfraDeps, InfraFolderPort } from './application/ports';
import { describeErrorMessages, describeFolderFailure, type FolderStage } from './domain/folder-failure';
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

/**
 * Serializes folder creation per project: two uploads (or a retry racing the first attempt) for the same
 * location must not create two folders. Transaction-scoped, so it is released when the write commits.
 */
async function lockProjectFolders(db: DbExecutor, input: { organizationId: string; projectId: string }): Promise<void> {
  const key = `infra-folders:${input.organizationId}:${input.projectId}`;
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

export async function buildRuntime(
  db: DbExecutor,
  input: { organizationId: string; projectId: string; userId?: string | null },
  onStage?: (stage: FolderStage) => void,
): Promise<FolderRuntime> {
  onStage?.('connection');
  const connection = await usableConnection(db, input.organizationId);
  onStage?.('token');
  const accessToken = await resolveValidAccessToken(db, input.organizationId, connection);
  onStage?.('locations');
  const nodes = await listLocationNodes(db, input.organizationId, input.projectId);
  let projectFolder: Promise<string> | null = null;
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
      // Lazy: the project's own folder is only touched when a folder really has to be created.
      getProjectFolderId() {
        projectFolder ??= (async () => {
          onStage?.('project_folder');
          const projectFolderId = await provisionStoredProjectFolder(db, {
            organizationId: input.organizationId,
            connection,
            accessToken,
            projectId: input.projectId,
          });
          if (!projectFolderId) {
            throw new DomainRuleError('Project folder is unavailable', 'infraMapping.errors.projectFolder');
          }
          onStage?.('folder');
          return projectFolderId;
        })();
        return projectFolder;
      },
      tree: nodes.map((node) => ({
        id: node.id,
        parentId: node.parentId,
        name: node.name,
        code: node.code,
        type: node.type,
        structure: node.structure ?? null,
        archived: node.archived,
      })),
    },
  };
}

/** Runs a folder-creating operation under the per-project lock (idempotent and parallel safe). */
export async function withFolderLock<T>(
  db: DbExecutor,
  input: { organizationId: string; projectId: string },
  work: () => Promise<T>,
): Promise<T> {
  await lockProjectFolders(db, input);
  return work();
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
        // Strict: a failure must surface (nothing may look created when it is not).
        return withFolderLock(db, input, () => ensureLocationFolder(runtime.context, input.locationId));
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
        ...describeErrorMessages(error),
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
      return withFolderLock(db, input, () => ensureLocationFolder(runtime.context, input.locationId));
    });
  },

  syncFolders(input) {
    return runCommittedStorageWrite(async (db) => {
      const runtime = await buildRuntime(db, { ...input, userId: input.createdByUserId });
      return withFolderLock(db, input, () =>
        syncLocationFolders(runtime.context, { locationIds: input.locationIds ?? null, batchSize: input.batchSize }),
      );
    });
  },

  renameFolder(input) {
    return runCommittedStorageWrite(async (db) => {
      const runtime = await buildRuntime(db, input);
      return withFolderLock(db, input, () => renameLocationFolder(runtime.context, input.locationId));
    });
  },

  moveFolder(input) {
    return runCommittedStorageWrite(async (db) => {
      const runtime = await buildRuntime(db, input);
      return withFolderLock(db, input, () => moveLocationFolder(runtime.context, input.locationId));
    });
  },

  async linkFolder(input) {
    await runCommittedStorageWrite(async (db) => {
      const runtime = await buildRuntime(db, { ...input, userId: input.createdByUserId });
      await withFolderLock(db, input, () =>
        linkExistingFolder(runtime.context, { locationId: input.locationId, externalFolderId: input.externalFolderId }),
      );
    });
  },

  inspectFolder(input) {
    return runCommittedStorageWrite(async (db) => {
      const runtime = await buildRuntime(db, input);
      return withFolderLock(db, input, () => inspectLocationFolder(runtime.context, input.locationId));
    });
  },

  resolveFolderDrift(input) {
    return runCommittedStorageWrite(async (db) => {
      const runtime = await buildRuntime(db, input);
      return withFolderLock(db, input, () =>
        resolveFolderDrift(runtime.context, { locationId: input.locationId, choice: input.choice }),
      );
    });
  },

  recreateFolder(input) {
    return runCommittedStorageWrite(async (db) => {
      const runtime = await buildRuntime(db, input);
      return withFolderLock(db, input, () => recreateMissingFolder(runtime.context, input.locationId));
    });
  },

  async relocateFiles(input) {
    if (input.documentIds.length === 0) return;
    await runCommittedStorageWrite(async (db) => {
      const runtime = await buildRuntime(db, input);
      const folderId = await withFolderLock(db, input, () => ensureLocationFolder(runtime.context, input.locationId));
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
      const folderId = await withFolderLock(db, input, () => ensureLocationFolder(runtime.context, input.locationId));
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

function providerStatusOf(error: unknown): number | null {
  for (let cursor: unknown = error, depth = 0; cursor && typeof cursor === 'object' && depth < 5; depth += 1) {
    const item = cursor as { name?: unknown; status?: unknown; cause?: unknown };
    if (item.name === 'ProviderHttpError' && typeof item.status === 'number') return item.status;
    cursor = item.cause;
  }
  return null;
}

/** Flags the location's folder as gone (a separate write: the failed upload transaction rolls back). */
async function flagFolderMissing(input: { organizationId: string; projectId: string; locationId: string }): Promise<void> {
  try {
    await runCommittedStorageWrite(async (db) => {
      const runtime = await buildRuntime(db, input);
      await withFolderLock(db, input, async () => {
        const rows = await runtime.context.store.list();
        const row = rows.find((item) => item.locationId === input.locationId);
        if (row) await runtime.context.store.update(row.id, { status: 'error', lastError: FOLDER_MISSING });
      });
    });
  } catch (error) {
    logger.warn('infra.flag_folder_missing_failed', { locationId: input.locationId, errorName: error instanceof Error ? error.name : typeof error });
  }
}

/**
 * Evidence store that writes infrastructure photos / videos into the folder of their location.
 *
 * The folder is created lazily on the first upload to a location (only the needed chain, under a per-project
 * lock so two parallel uploads never create two folders) and reused afterwards without any provider call. If
 * the folder cannot be resolved the upload FAILS with a clear error - it is never filed somewhere else and never
 * reported as saved - so the client keeps the file and retries.
 */
export const infraFileStore: ProjectFileDeps['store'] = {
  resolveConnection: externalProviderFileStore.resolveConnection,
  open: externalProviderFileStore.open,
  async put(input) {
    const targetLocation = await runCommittedStorageWrite((db) =>
      findEvidenceLocationByDocument(db, input.organizationId, input.documentId),
    );
    if (!targetLocation) return externalProviderFileStore.put(input);

    const scope = { organizationId: input.organizationId, projectId: input.projectId, locationId: targetLocation };
    const target = await runCommittedStorageWrite(async (db) => {
      const runtime = await buildRuntime(db, scope);
      const folderId = await withFolderLock(db, scope, () => ensureLocationFolder(runtime.context, targetLocation));
      return { connection: runtime.connection, accessToken: runtime.accessToken, folderId };
    }).catch((error: unknown) => {
      if (error instanceof DomainRuleError || error instanceof ServiceUnavailableError || error instanceof NotFoundError) throw error;
      logger.error('infra.upload_folder_failed', {
        locationId: targetLocation,
        code: describeFolderFailure('folder', error).code,
      });
      throw new ServiceUnavailableError('Location folder could not be created', 'infraMapping.errors.folderCreate');
    });

    try {
      const uploaded = await getStorageProviderAdapter(target.connection.provider).uploadFile(target.accessToken, {
        parentFolderId: target.folderId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        body: input.bytes,
        sizeBytes: input.bytes.length,
      });
      return {
        connectionId: target.connection.id,
        provider: target.connection.provider,
        externalFileId: uploaded.id,
        externalParentFolderId: target.folderId,
        etag: uploaded.etag ?? null,
        sizeBytes: uploaded.sizeBytes ?? input.bytes.length,
        checksum: createHash('sha256').update(input.bytes).digest('hex'),
      } satisfies StoredFile;
    } catch (error) {
      if (providerStatusOf(error) === 404) {
        await flagFolderMissing(scope);
        throw new DomainRuleError('The cloud folder was removed or moved away', 'infraMapping.errors.folderMissing');
      }
      throw error;
    }
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
