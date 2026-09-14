import 'server-only';

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError, ServiceUnavailableError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { updateDocumentById } from '@/modules/documents';
import type { SemanticFolderType } from '@drizzle/schema/external-storage';
import {
  findStorageFileByExternalId,
  updateStorageFile,
  updateStorageFileByExternalId,
} from '../data/files.repository';
import {
  findFolderMapping,
  findFolderMappingByExternalFolderId,
  listFolderMappingsForProject,
  updateFolderMapping,
} from '../data/folder-mappings.repository';
import type {
  ProviderFileItem,
  ProviderFolderItem,
  ProviderFolderListing,
  StorageConnectionRecord,
} from '../domain/types';
import type { StorageProviderAdapter } from '../domain/provider-interface';
import { ProviderHttpError } from '../providers/http-utils';
import { getStorageProviderAdapter } from '../providers/registry';
import {
  assertOrganizationStorageAvailable,
  resolveValidAccessToken,
} from './connection-service';
import { ensureOrganizationStorageProvisioned } from './provision-storage';
import { assertFolderWithinProjectTree, isFolderDescendantOf } from './browser-scope';

const MAX_MOVE_TARGETS = 250;

export interface ProjectBrowserFolderTarget {
  readonly id: string;
  readonly pathLabel: string;
}

export interface ProjectBrowserListingResult {
  readonly semanticFolderType: SemanticFolderType;
  readonly folderExternalId: string;
  readonly folderName: string;
  readonly listing: ProviderFolderListing;
}

interface ProjectBrowserRuntime {
  readonly connection: StorageConnectionRecord;
  readonly accessToken: string;
  readonly adapter: StorageProviderAdapter;
  readonly projectRootFolderIds: ReadonlySet<string>;
}

async function resolveProjectBrowserRuntime(
  context: OrgContext,
  projectId: string,
): Promise<ProjectBrowserRuntime> {
  const connection = await assertOrganizationStorageAvailable(context);
  const accessToken = await resolveValidAccessToken(context.db, context.organizationId, connection);

  await ensureOrganizationStorageProvisioned(context, projectId);

  const mappings = await listFolderMappingsForProject(
    context.db,
    context.organizationId,
    connection.id,
    projectId,
  );
  const readyRoots = mappings.filter((m) => m.status === 'ready').map((m) => m.externalFolderId);

  if (readyRoots.length === 0) {
    throw new ServiceUnavailableError(
      'Project folders not provisioned',
      'externalStorage.errors.fileUnavailable',
    );
  }
  return {
    connection,
    accessToken,
    adapter: getStorageProviderAdapter(connection.provider),
    projectRootFolderIds: new Set(readyRoots),
  };
}

async function assertFolderScope(
  runtime: ProjectBrowserRuntime,
  folderId: string,
): Promise<void> {
  await assertFolderWithinProjectTree(
    runtime.adapter,
    runtime.accessToken,
    folderId,
    runtime.projectRootFolderIds,
  );
}

async function assertFileScope(
  runtime: ProjectBrowserRuntime,
  fileId: string,
): Promise<ProviderFileItem> {
  const meta = await runtime.adapter.getFileMetadata(runtime.accessToken, fileId);
  if (!meta?.parentId) {
    throw new NotFoundError('File');
  }
  await assertFolderScope(runtime, meta.parentId);
  return meta;
}

function normalizeBrowserName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new DomainRuleError('Name is required', 'externalStorage.errors.invalidName');
  }
  if (/[\\/:*?"<>|]/.test(trimmed)) {
    throw new DomainRuleError('Invalid name characters', 'externalStorage.errors.invalidName');
  }
  return trimmed;
}

async function syncLinkedDocumentFile(
  context: OrgContext,
  runtime: ProjectBrowserRuntime,
  previousExternalFileId: string,
  updated: ProviderFileItem,
  options?: { fallbackParentFolderId?: string },
): Promise<void> {
  const storageFile = await findStorageFileByExternalId(
    context.db,
    context.organizationId,
    runtime.connection.id,
    previousExternalFileId,
  );
  if (!storageFile) return;

  const parentFolderId =
    updated.parentId ?? options?.fallbackParentFolderId ?? storageFile.externalParentFolderId;
  const idChanged = updated.id !== previousExternalFileId;
  const storagePatch = {
    originalFilename: updated.name,
    externalParentFolderId: parentFolderId,
    externalEtag: updated.etag,
    ...(updated.sizeBytes !== undefined ? { sizeBytes: updated.sizeBytes } : {}),
    ...(idChanged ? { externalFileId: updated.id } : {}),
  };

  if (idChanged) {
    await updateStorageFile(context.db, context.organizationId, storageFile.id, storagePatch);
  } else {
    await updateStorageFileByExternalId(
      context.db,
      context.organizationId,
      runtime.connection.id,
      previousExternalFileId,
      storagePatch,
    );
  }

  if (!storageFile.documentId) return;

  await updateDocumentById(context.db, context.organizationId, storageFile.documentId, {
    originalFilename: updated.name,
    externalParentFolderId: parentFolderId,
    externalEtag: updated.etag,
    ...(updated.sizeBytes !== undefined ? { sizeBytes: updated.sizeBytes } : {}),
    ...(idChanged ? { externalFileId: updated.id, storagePath: updated.id } : {}),
  });
}

async function syncLinkedDocumentFileDeleted(
  context: OrgContext,
  runtime: ProjectBrowserRuntime,
  externalFileId: string,
): Promise<void> {
  const storageFile = await findStorageFileByExternalId(
    context.db,
    context.organizationId,
    runtime.connection.id,
    externalFileId,
  );
  if (!storageFile) return;

  await updateStorageFileByExternalId(
    context.db,
    context.organizationId,
    runtime.connection.id,
    externalFileId,
    { status: 'deleted', lastError: 'browser_deleted' },
  );
  if (storageFile.documentId) {
    await updateDocumentById(context.db, context.organizationId, storageFile.documentId, {
      status: 'deleted',
      deletedAt: new Date(),
    });
  }
}

async function syncLinkedFolderMapping(
  context: OrgContext,
  runtime: ProjectBrowserRuntime,
  previousExternalFolderId: string,
  updated: ProviderFolderItem,
  options?: { fallbackParentFolderId?: string },
): Promise<void> {
  const mapping = await findFolderMappingByExternalFolderId(
    context.db,
    context.organizationId,
    runtime.connection.id,
    previousExternalFolderId,
  );
  if (!mapping) return;

  const parentFolderId =
    updated.parentId ?? options?.fallbackParentFolderId ?? mapping.externalParentId;
  const idChanged = updated.id !== previousExternalFolderId;

  await updateFolderMapping(context.db, context.organizationId, mapping.id, {
    displayName: updated.name,
    ...(parentFolderId !== undefined ? { externalParentId: parentFolderId } : {}),
    ...(idChanged ? { externalFolderId: updated.id } : {}),
  });
}

function mapProviderError(error: unknown): never {
  if (error instanceof ProviderHttpError) {
    if (error.isQuotaExceeded()) {
      throw new ServiceUnavailableError(
        'External storage quota exceeded',
        'externalStorage.errors.quotaFull',
      );
    }
    if (error.isFolderNotEmpty()) {
      throw new DomainRuleError('Folder not empty', 'externalStorage.errors.folderNotEmpty');
    }
    if (error.isUnauthorized()) {
      throw new ServiceUnavailableError(
        'Storage reconnect required',
        'externalStorage.errors.reconnectRequired',
      );
    }
  }
  throw error;
}

async function resolveSemanticFolderId(
  context: OrgContext,
  runtime: ProjectBrowserRuntime,
  projectId: string,
  semanticFolderType: SemanticFolderType,
): Promise<{ externalFolderId: string; folderName: string }> {
  const mapping = await findFolderMapping(context.db, {
    organizationId: context.organizationId,
    connectionId: runtime.connection.id,
    semanticFolderType,
    entityType: 'project',
    entityId: projectId,
  });
  if (!mapping || mapping.status !== 'ready') {
    throw new NotFoundError('Folder');
  }
  return { externalFolderId: mapping.externalFolderId, folderName: mapping.displayName };
}

export async function browseProjectStorageFolder(
  context: OrgContext,
  input: {
    projectId: string;
    semanticFolderType: SemanticFolderType;
    folderExternalId?: string | null;
  },
): Promise<ProjectBrowserListingResult> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const runtime = await resolveProjectBrowserRuntime(context, input.projectId);
  const semantic = await resolveSemanticFolderId(
    context,
    runtime,
    input.projectId,
    input.semanticFolderType,
  );
  const folderExternalId = input.folderExternalId?.trim() || semantic.externalFolderId;
  await assertFolderScope(runtime, folderExternalId);

  let folderName = semantic.folderName;
  if (folderExternalId !== semantic.externalFolderId) {
    const folder = await runtime.adapter.getFolder(runtime.accessToken, folderExternalId);
    folderName = folder?.name ?? folderName;
  }

  const listing = await runtime.adapter.listFolder(runtime.accessToken, folderExternalId);
  return {
    semanticFolderType: input.semanticFolderType,
    folderExternalId,
    folderName,
    listing,
  };
}

export async function createProjectStorageSubfolder(
  context: OrgContext,
  input: {
    projectId: string;
    parentFolderExternalId: string;
    name: string;
  },
): Promise<ProviderFolderItem> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const runtime = await resolveProjectBrowserRuntime(context, input.projectId);
  await assertFolderScope(runtime, input.parentFolderExternalId);
  const name = normalizeBrowserName(input.name);

  try {
    return await runtime.adapter.createFolder(runtime.accessToken, {
      name,
      parentId: input.parentFolderExternalId,
    });
  } catch (error) {
    mapProviderError(error);
  }
}

export async function renameProjectStorageItem(
  context: OrgContext,
  input: {
    projectId: string;
    itemId: string;
    itemKind: 'file' | 'folder';
    name: string;
  },
): Promise<ProviderFileItem | ProviderFolderItem> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const runtime = await resolveProjectBrowserRuntime(context, input.projectId);
  const name = normalizeBrowserName(input.name);

  try {
    if (input.itemKind === 'folder') {
      await assertFolderScope(runtime, input.itemId);
      if (runtime.projectRootFolderIds.has(input.itemId)) {
        throw new DomainRuleError(
          'Cannot rename managed folder',
          'externalStorage.errors.managedFolder',
        );
      }
      const updated = await runtime.adapter.renameFolder(runtime.accessToken, input.itemId, name);
      await syncLinkedFolderMapping(context, runtime, input.itemId, updated);
      return updated;
    }

    await assertFileScope(runtime, input.itemId);
    const updated = await runtime.adapter.renameFile(runtime.accessToken, input.itemId, name);
    await syncLinkedDocumentFile(context, runtime, input.itemId, updated);
    return updated;
  } catch (error) {
    mapProviderError(error);
  }
}

export async function moveProjectStorageItem(
  context: OrgContext,
  input: {
    projectId: string;
    itemId: string;
    itemKind: 'file' | 'folder';
    targetFolderExternalId: string;
  },
): Promise<ProviderFileItem | ProviderFolderItem> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const runtime = await resolveProjectBrowserRuntime(context, input.projectId);
  await assertFolderScope(runtime, input.targetFolderExternalId);

  if (input.itemKind === 'folder') {
    if (runtime.projectRootFolderIds.has(input.itemId)) {
      throw new DomainRuleError(
        'Cannot move managed folder',
        'externalStorage.errors.managedFolder',
      );
    }
    if (input.itemId === input.targetFolderExternalId) {
      throw new DomainRuleError('Invalid move target', 'externalStorage.errors.invalidMoveTarget');
    }
    if (
      await isFolderDescendantOf(
        runtime.adapter,
        runtime.accessToken,
        input.targetFolderExternalId,
        input.itemId,
      )
    ) {
      throw new DomainRuleError('Invalid move target', 'externalStorage.errors.invalidMoveTarget');
    }
  }

  try {
    if (input.itemKind === 'folder') {
      await assertFolderScope(runtime, input.itemId);
      const updated = await runtime.adapter.moveFolder(
        runtime.accessToken,
        input.itemId,
        input.targetFolderExternalId,
      );
      await syncLinkedFolderMapping(context, runtime, input.itemId, updated, {
        fallbackParentFolderId: input.targetFolderExternalId,
      });
      return updated;
    }

    await assertFileScope(runtime, input.itemId);
    const updated = await runtime.adapter.moveFile(
      runtime.accessToken,
      input.itemId,
      input.targetFolderExternalId,
    );
    await syncLinkedDocumentFile(context, runtime, input.itemId, updated, {
      fallbackParentFolderId: input.targetFolderExternalId,
    });
    return updated;
  } catch (error) {
    mapProviderError(error);
  }
}

export async function deleteProjectStorageItem(
  context: OrgContext,
  input: {
    projectId: string;
    itemId: string;
    itemKind: 'file' | 'folder';
  },
): Promise<void> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const runtime = await resolveProjectBrowserRuntime(context, input.projectId);

  try {
    if (input.itemKind === 'folder') {
      if (runtime.projectRootFolderIds.has(input.itemId)) {
        throw new DomainRuleError(
          'Cannot delete managed folder',
          'externalStorage.errors.managedFolder',
        );
      }
      await assertFolderScope(runtime, input.itemId);
      const listing = await runtime.adapter.listFolder(runtime.accessToken, input.itemId);
      if (listing.folders.length > 0 || listing.files.length > 0) {
        throw new DomainRuleError('Folder not empty', 'externalStorage.errors.folderNotEmpty');
      }
      await runtime.adapter.deleteFolder(runtime.accessToken, input.itemId);
      return;
    }

    await assertFileScope(runtime, input.itemId);
    await runtime.adapter.deleteFile(runtime.accessToken, input.itemId);
    await syncLinkedDocumentFileDeleted(context, runtime, input.itemId);
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.STORAGE_FILE_DELETED,
      entityType: 'storage_file',
      entityId: input.itemId,
      after: { projectId: input.projectId },
    });
  } catch (error) {
    mapProviderError(error);
  }
}

export async function listProjectStorageMoveTargets(
  context: OrgContext,
  input: {
    projectId: string;
    excludeFolderId?: string | null;
  },
): Promise<readonly ProjectBrowserFolderTarget[]> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const runtime = await resolveProjectBrowserRuntime(context, input.projectId);
  const mappings = await listFolderMappingsForProject(
    context.db,
    context.organizationId,
    runtime.connection.id,
    input.projectId,
  );

  const targets: ProjectBrowserFolderTarget[] = [];
  const seen = new Set<string>();
  const queue: Array<{ id: string; pathLabel: string }> = mappings
    .filter((m) => m.status === 'ready')
    .map((m) => ({ id: m.externalFolderId, pathLabel: m.displayName }));

  while (queue.length > 0 && targets.length < MAX_MOVE_TARGETS) {
    const current = queue.shift()!;
    if (seen.has(current.id)) continue;
    seen.add(current.id);

    if (input.excludeFolderId && current.id === input.excludeFolderId) continue;
    if (
      input.excludeFolderId &&
      (await isFolderDescendantOf(
        runtime.adapter,
        runtime.accessToken,
        current.id,
        input.excludeFolderId,
      ))
    ) {
      continue;
    }

    targets.push({ id: current.id, pathLabel: current.pathLabel });

    const listing = await runtime.adapter.listFolder(runtime.accessToken, current.id);
    for (const folder of listing.folders) {
      queue.push({ id: folder.id, pathLabel: `${current.pathLabel} / ${folder.name}` });
    }
  }

  return targets;
}

export async function getProjectStorageFileDownload(
  context: OrgContext,
  input: { projectId: string; fileId: string },
): Promise<
  | { url: string; filename: string; mimeType: string }
  | { stream: ReadableStream<Uint8Array>; filename: string; mimeType: string }
> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const runtime = await resolveProjectBrowserRuntime(context, input.projectId);
  const meta = await assertFileScope(runtime, input.fileId);

  if (runtime.adapter.getProviderWebUrl) {
    const webUrl = await runtime.adapter.getProviderWebUrl(runtime.accessToken, input.fileId);
    if (webUrl) {
      return { url: webUrl, filename: meta.name, mimeType: meta.mimeType ?? 'application/octet-stream' };
    }
  }

  const downloaded = await runtime.adapter.downloadFileStream(runtime.accessToken, input.fileId);
  return {
    stream: downloaded.stream,
    filename: meta.name,
    mimeType: downloaded.mimeType,
  };
}

export async function assertProjectBrowserUploadFolder(
  context: OrgContext,
  input: { projectId: string; parentFolderExternalId: string },
): Promise<void> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const runtime = await resolveProjectBrowserRuntime(context, input.projectId);
  await assertFolderScope(runtime, input.parentFolderExternalId);
}
