import 'server-only';

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError, ServiceUnavailableError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { updateDocumentById } from '@/modules/documents';
import { parseByteRangeHeader } from '../server/byte-range';
import { PROJECT_SEMANTIC_FOLDERS } from '../domain/semantic-folders';
import {
  canAccessSemanticFolder,
  filterAccessibleSemanticShortcuts,
  isProjectSemanticFolderType,
  resolveSemanticFolderForPath,
} from '../domain/semantic-folder-access';
import { isEmployeeAppUser } from '@/modules/employee-app/application/load-employee-app-context';
import type { SemanticFolderType } from '@drizzle/schema/external-storage';
import {
  findStorageFileByExternalId,
  updateStorageFile,
  updateStorageFileByExternalId,
} from '../data/files.repository';
import {
  findFolderMappingByExternalFolderId,
  listFolderMappingsForProject,
  updateFolderMapping,
} from '../data/folder-mappings.repository';
import type {
  FolderMappingRecord,
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
import { commitOrganizationStorageProvision } from './provision-storage';
import { assertFolderWithinProjectTree, isFolderDescendantOf } from './browser-scope';

const MAX_MOVE_TARGETS = 250;

export interface ProjectBrowserFolderTarget {
  readonly id: string;
  readonly pathLabel: string;
}

export interface ProjectBrowserListingResult {
  readonly folderExternalId: string;
  readonly folderName: string;
  readonly projectRootFolderId: string;
  readonly listing: ProviderFolderListing;
}

export interface ProjectStorageBrowserContext {
  readonly provider: StorageConnectionRecord['provider'];
  readonly projectRootFolderId: string;
  readonly projectRootFolderName: string;
  readonly semanticShortcuts: ReadonlyArray<{
    readonly semanticFolderType: SemanticFolderType;
    readonly externalFolderId: string;
    readonly displayName: string;
  }>;
}

export interface ProjectFileBrowserInitialLoad {
  readonly context: ProjectStorageBrowserContext;
  readonly folderExternalId: string;
  readonly folderName: string;
  readonly folders: readonly ProviderFolderItem[];
  readonly files: readonly ProviderFileItem[];
}

interface ProjectBrowserRuntime {
  readonly connection: StorageConnectionRecord;
  readonly accessToken: string;
  readonly adapter: StorageProviderAdapter;
  /** Hard security boundary — descendants of this folder only. */
  readonly projectRootFolderId: string;
  readonly projectRootMapping: FolderMappingRecord;
  readonly mappings: readonly FolderMappingRecord[];
  /** Bootstrap/system mapped folders — no rename/move/delete. */
  readonly protectedFolderIds: ReadonlySet<string>;
}

function buildSemanticShortcuts(
  mappings: readonly FolderMappingRecord[],
): ProjectStorageBrowserContext['semanticShortcuts'] {
  return PROJECT_SEMANTIC_FOLDERS.flatMap((semanticFolderType) => {
    const mapping = mappings.find(
      (m) => m.semanticFolderType === semanticFolderType && m.status === 'ready',
    );
    if (!mapping) return [];
    return [
      {
        semanticFolderType,
        externalFolderId: mapping.externalFolderId,
        displayName: mapping.displayName,
      },
    ];
  });
}

function buildBrowserContext(
  context: OrgContext,
  runtime: ProjectBrowserRuntime,
): ProjectStorageBrowserContext {
  return {
    provider: runtime.connection.provider,
    projectRootFolderId: runtime.projectRootFolderId,
    projectRootFolderName: runtime.projectRootMapping.displayName,
    semanticShortcuts: filterAccessibleSemanticShortcuts(
      context,
      buildSemanticShortcuts(runtime.mappings),
    ),
  };
}

async function resolveSemanticFolderInTree(
  runtime: ProjectBrowserRuntime,
  folderExternalId: string,
): Promise<SemanticFolderType | 'project_root' | null> {
  if (folderExternalId === runtime.projectRootFolderId) return 'project_root';

  const mapped = resolveSemanticFolderForPath(folderExternalId, runtime.mappings);
  if (mapped) return mapped;

  let current = folderExternalId;
  for (let depth = 0; depth < 32; depth++) {
    const folder = await runtime.adapter.getFolder(runtime.accessToken, current);
    if (!folder?.parentId) return null;
    if (folder.parentId === runtime.projectRootFolderId) return null;

    const parentMapped = resolveSemanticFolderForPath(folder.parentId, runtime.mappings);
    if (parentMapped) return parentMapped;

    const parentMapping = runtime.mappings.find(
      (mapping) => mapping.externalFolderId === folder.parentId && mapping.status === 'ready',
    );
    if (parentMapping?.semanticFolderType === 'project_root') return null;
    if (
      parentMapping &&
      isProjectSemanticFolderType(parentMapping.semanticFolderType)
    ) {
      return parentMapping.semanticFolderType;
    }

    current = folder.parentId;
  }

  return null;
}

async function assertSemanticFolderBrowseAccess(
  context: OrgContext,
  runtime: ProjectBrowserRuntime,
  folderExternalId: string,
): Promise<void> {
  if (!isEmployeeAppUser(context)) return;

  const semantic = await resolveSemanticFolderInTree(runtime, folderExternalId);
  if (semantic === 'project_root') return;
  if (!semantic || !canAccessSemanticFolder(context, semantic)) {
    throw new NotFoundError('Folder');
  }
}

function filterListingForSemanticAccess(
  context: OrgContext,
  runtime: ProjectBrowserRuntime,
  folderExternalId: string,
  listing: ProviderFolderListing,
): ProviderFolderListing {
  if (!isEmployeeAppUser(context)) return listing;
  if (folderExternalId !== runtime.projectRootFolderId) return listing;

  const allowedFolderIds = new Set(
    runtime.mappings
      .filter(
        (mapping) =>
          mapping.status === 'ready' &&
          isProjectSemanticFolderType(mapping.semanticFolderType) &&
          canAccessSemanticFolder(context, mapping.semanticFolderType),
      )
      .map((mapping) => mapping.externalFolderId),
  );

  return {
    folders: listing.folders.filter(
      (folder) =>
        allowedFolderIds.has(folder.id) ||
        !runtime.protectedFolderIds.has(folder.id),
    ),
    files: listing.files,
  };
}

async function resolveProjectBrowserRuntime(
  context: OrgContext,
  projectId: string,
): Promise<ProjectBrowserRuntime> {
  const { assertCanAccessProjectForUser } = await import(
    '@/modules/employee-app/application/project-scope'
  );
  await assertCanAccessProjectForUser(context, projectId);

  const connection = await assertOrganizationStorageAvailable(context);
  const accessToken = await resolveValidAccessToken(context.db, context.organizationId, connection);

  let mappings = await listFolderMappingsForProject(
    context.db,
    context.organizationId,
    connection.id,
    projectId,
  );
  if (!mappings.some((m) => m.status === 'ready')) {
    await commitOrganizationStorageProvision({
      userId: context.userId,
      organizationId: context.organizationId,
      connectionId: connection.id,
      projectId,
    });
    mappings = await listFolderMappingsForProject(
      context.db,
      context.organizationId,
      connection.id,
      projectId,
    );
  }

  const projectRootMapping = mappings.find(
    (m) => m.semanticFolderType === 'project_root' && m.status === 'ready',
  );
  if (!projectRootMapping) {
    throw new ServiceUnavailableError(
      'Project folders not provisioned',
      'externalStorage.errors.fileUnavailable',
    );
  }

  const protectedFolderIds = new Set(
    mappings.filter((m) => m.status === 'ready').map((m) => m.externalFolderId),
  );

  return {
    connection,
    accessToken,
    adapter: getStorageProviderAdapter(connection.provider),
    projectRootFolderId: projectRootMapping.externalFolderId,
    projectRootMapping,
    mappings,
    protectedFolderIds,
  };
}

async function assertFolderScope(
  runtime: ProjectBrowserRuntime,
  folderId: string,
): Promise<void> {
  if (folderId === runtime.projectRootFolderId) return;
  if (runtime.protectedFolderIds.has(folderId)) return;
  await assertFolderWithinProjectTree(
    runtime.adapter,
    runtime.accessToken,
    folderId,
    new Set([runtime.projectRootFolderId]),
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

export async function getProjectStorageBrowserContext(
  context: OrgContext,
  projectId: string,
): Promise<ProjectStorageBrowserContext> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const runtime = await resolveProjectBrowserRuntime(context, projectId);
  return buildBrowserContext(context, runtime);
}

/** Single round-trip initial load: context + project_root children only. */
export async function loadProjectFileBrowserInitial(
  context: OrgContext,
  projectId: string,
): Promise<ProjectFileBrowserInitialLoad> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const runtime = await resolveProjectBrowserRuntime(context, projectId);
  const listing = await runtime.adapter.listFolder(
    runtime.accessToken,
    runtime.projectRootFolderId,
  );
  const filtered = filterListingForSemanticAccess(
    context,
    runtime,
    runtime.projectRootFolderId,
    listing,
  );
  const browserContext = buildBrowserContext(context, runtime);
  return {
    context: browserContext,
    folderExternalId: runtime.projectRootFolderId,
    folderName: browserContext.projectRootFolderName,
    folders: filtered.folders,
    files: filtered.files,
  };
}

export async function browseProjectStorageFolder(
  context: OrgContext,
  input: {
    projectId: string;
    /** Omit or null to list the project root folder. */
    folderExternalId?: string | null;
    folderName?: string | null;
  },
): Promise<ProjectBrowserListingResult> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const runtime = await resolveProjectBrowserRuntime(context, input.projectId);
  const folderExternalId = input.folderExternalId?.trim() || runtime.projectRootFolderId;
  const isProjectRoot = folderExternalId === runtime.projectRootFolderId;
  await assertFolderScope(runtime, folderExternalId);
  await assertSemanticFolderBrowseAccess(context, runtime, folderExternalId);

  const hintedName = input.folderName?.trim();
  const folderName = isProjectRoot
    ? runtime.projectRootMapping.displayName
    : hintedName ||
      ((await runtime.adapter.getFolder(runtime.accessToken, folderExternalId))?.name ?? 'Folder');

  const listing = await runtime.adapter.listFolder(runtime.accessToken, folderExternalId);
  const filtered = filterListingForSemanticAccess(context, runtime, folderExternalId, listing);
  return {
    folderExternalId,
    folderName,
    projectRootFolderId: runtime.projectRootFolderId,
    listing: filtered,
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
      if (runtime.protectedFolderIds.has(input.itemId)) {
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
    if (runtime.protectedFolderIds.has(input.itemId)) {
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
      if (runtime.protectedFolderIds.has(input.itemId)) {
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
  const rootFolder = await runtime.adapter.getFolder(
    runtime.accessToken,
    runtime.projectRootFolderId,
  );
  const rootLabel = rootFolder?.name ?? 'ProjectFlow';

  const targets: ProjectBrowserFolderTarget[] = [];
  const seen = new Set<string>();
  const queue: Array<{ id: string; pathLabel: string }> = [
    { id: runtime.projectRootFolderId, pathLabel: rootLabel },
  ];

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

export async function streamProjectStorageFileDownload(
  context: OrgContext,
  input: { projectId: string; fileId: string; rangeHeader: string | null },
): Promise<
  | { unsatisfiable: true; sizeBytes: number | null }
  | {
      stream: ReadableStream<Uint8Array>;
      filename: string;
      mimeType: string;
      sizeBytes: number | null;
      httpStatus: number;
      contentRange: string | null;
      byteRange: { start: number; end: number } | null;
    }
> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const runtime = await resolveProjectBrowserRuntime(context, input.projectId);
  const meta = await assertFileScope(runtime, input.fileId);
  if (meta.parentId) {
    await assertSemanticFolderBrowseAccess(context, runtime, meta.parentId);
  }

  let byteRange: { start: number; end: number } | null = null;
  if (input.rangeHeader) {
    const parsed = parseByteRangeHeader(input.rangeHeader, meta.sizeBytes ?? 0);
    if (parsed === 'unsatisfiable') {
      return { unsatisfiable: true, sizeBytes: meta.sizeBytes ?? null };
    }
    if (parsed) byteRange = parsed;
  }

  const downloaded = await runtime.adapter.downloadFileStream(runtime.accessToken, input.fileId, {
    byteRange: byteRange ?? undefined,
    knownMeta: meta,
  });

  return {
    stream: downloaded.stream,
    filename: meta.name,
    mimeType: downloaded.mimeType,
    sizeBytes: meta.sizeBytes ?? downloaded.sizeBytes ?? null,
    httpStatus: downloaded.httpStatus ?? 200,
    contentRange: downloaded.contentRange ?? null,
    byteRange,
  };
}

export async function getProjectStorageFileDownloadMeta(
  context: OrgContext,
  input: { projectId: string; fileId: string },
): Promise<{ filename: string; mimeType: string; sizeBytes: number | null }> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const runtime = await resolveProjectBrowserRuntime(context, input.projectId);
  const meta = await assertFileScope(runtime, input.fileId);
  if (meta.parentId) {
    await assertSemanticFolderBrowseAccess(context, runtime, meta.parentId);
  }
  return {
    filename: meta.name,
    mimeType: meta.mimeType ?? 'application/octet-stream',
    sizeBytes: meta.sizeBytes ?? null,
  };
}

export async function getProjectStorageFileDownload(
  context: OrgContext,
  input: {
    projectId: string;
    fileId: string;
    byteRange?: { start: number; end: number } | null;
  },
): Promise<{
  stream: ReadableStream<Uint8Array>;
  filename: string;
  mimeType: string;
  sizeBytes: number | null;
  httpStatus: number;
  contentRange: string | null;
}> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const runtime = await resolveProjectBrowserRuntime(context, input.projectId);
  const meta = await assertFileScope(runtime, input.fileId);
  if (meta.parentId) {
    await assertSemanticFolderBrowseAccess(context, runtime, meta.parentId);
  }
  const downloaded = await runtime.adapter.downloadFileStream(
    runtime.accessToken,
    input.fileId,
    {
      byteRange: input.byteRange ?? undefined,
      knownMeta: meta,
    },
  );
  return {
    stream: downloaded.stream,
    filename: meta.name,
    mimeType: downloaded.mimeType,
    sizeBytes: downloaded.sizeBytes ?? meta.sizeBytes ?? null,
    httpStatus: downloaded.httpStatus ?? 200,
    contentRange: downloaded.contentRange ?? null,
  };
}

export async function getProjectStorageProviderWebUrl(
  context: OrgContext,
  input: { projectId: string; fileId: string },
): Promise<{ url: string; filename: string }> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const { isEmployeeAppUser } = await import(
    '@/modules/employee-app/application/load-employee-app-context'
  );
  if (isEmployeeAppUser(context)) {
    throw new ServiceUnavailableError(
      'Direct provider links are not available for employee accounts',
      'employeeApp.errors.providerLinkDenied',
    );
  }
  const runtime = await resolveProjectBrowserRuntime(context, input.projectId);
  const meta = await assertFileScope(runtime, input.fileId);
  if (!runtime.adapter.getProviderWebUrl) {
    throw new ServiceUnavailableError(
      'Provider web URL unavailable',
      'externalStorage.errors.operationFailed',
    );
  }
  const url = await runtime.adapter.getProviderWebUrl(runtime.accessToken, input.fileId);
  if (!url) {
    throw new NotFoundError('File');
  }
  return { url, filename: meta.name };
}

export async function assertProjectBrowserUploadFolder(
  context: OrgContext,
  input: { projectId: string; parentFolderExternalId: string },
): Promise<void> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const runtime = await resolveProjectBrowserRuntime(context, input.projectId);
  await assertFolderScope(runtime, input.parentFolderExternalId);
}

/** Validates a provider file is within the project tree and returns live metadata. */
export async function assertProjectProviderFileAccess(
  context: OrgContext,
  projectId: string,
  providerFileId: string,
): Promise<{ connection: StorageConnectionRecord; file: ProviderFileItem }> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const runtime = await resolveProjectBrowserRuntime(context, projectId);
  const file = await assertFileScope(runtime, providerFileId);
  if (file.parentId) {
    await assertSemanticFolderBrowseAccess(context, runtime, file.parentId);
  }
  return { connection: runtime.connection, file };
}
