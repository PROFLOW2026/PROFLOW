import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ServiceUnavailableError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { parseByteRangeHeader } from '../server/byte-range';
import { ORGANIZATION_BASE_FOLDERS } from '../domain/semantic-folders';
import type { SemanticFolderType } from '@drizzle/schema/external-storage';
import {
  findFolderMapping,
  listFolderMappingsForConnection,
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
import { ensureOrganizationRootFolder } from './folder-provisioning';
import { assertFolderWithinProjectTree, isFolderDescendantOf } from './browser-scope';

const MAX_MOVE_TARGETS = 250;

export interface OrgStorageBrowserContext {
  readonly provider: StorageConnectionRecord['provider'];
  readonly organizationRootFolderId: string;
  readonly organizationRootFolderName: string;
  readonly semanticShortcuts: ReadonlyArray<{
    readonly semanticFolderType: SemanticFolderType;
    readonly externalFolderId: string;
    readonly displayName: string;
  }>;
}

export interface OrgFileBrowserInitialLoad {
  readonly context: OrgStorageBrowserContext;
  readonly folderExternalId: string;
  readonly folderName: string;
  readonly folders: readonly ProviderFolderItem[];
  readonly files: readonly ProviderFileItem[];
}

export interface OrgBrowserListingResult {
  readonly folderExternalId: string;
  readonly folderName: string;
  readonly organizationRootFolderId: string;
  readonly listing: ProviderFolderListing;
}

export interface OrgBrowserFolderTarget {
  readonly id: string;
  readonly pathLabel: string;
}

interface OrgBrowserRuntime {
  readonly connection: StorageConnectionRecord;
  readonly accessToken: string;
  readonly adapter: StorageProviderAdapter;
  readonly organizationRootFolderId: string;
  readonly organizationRootMapping: FolderMappingRecord;
  readonly mappings: readonly FolderMappingRecord[];
  readonly protectedFolderIds: ReadonlySet<string>;
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

function buildOrgSemanticShortcuts(
  mappings: readonly FolderMappingRecord[],
): OrgStorageBrowserContext['semanticShortcuts'] {
  return ORGANIZATION_BASE_FOLDERS.flatMap((semanticFolderType) => {
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

function buildOrgBrowserContext(runtime: OrgBrowserRuntime): OrgStorageBrowserContext {
  return {
    provider: runtime.connection.provider,
    organizationRootFolderId: runtime.organizationRootFolderId,
    organizationRootFolderName: runtime.organizationRootMapping.displayName,
    semanticShortcuts: buildOrgSemanticShortcuts(runtime.mappings),
  };
}

export async function resolveOrgBrowserRuntime(context: OrgContext): Promise<OrgBrowserRuntime> {
  const connection = await assertOrganizationStorageAvailable(context);
  const accessToken = await resolveValidAccessToken(
    context.db,
    context.organizationId,
    connection,
  );

  await ensureOrganizationRootFolder(
    context.db,
    context.organizationId,
    connection,
    accessToken,
  );

  const organizationRootMapping = await findFolderMapping(context.db, {
    organizationId: context.organizationId,
    connectionId: connection.id,
    semanticFolderType: 'organization_root',
  });
  if (!organizationRootMapping || organizationRootMapping.status !== 'ready') {
    throw new ServiceUnavailableError(
      'Organization folders not provisioned',
      'externalStorage.errors.fileUnavailable',
    );
  }

  const mappings = await listFolderMappingsForConnection(
    context.db,
    context.organizationId,
    connection.id,
  );
  const orgLevelMappings = mappings.filter((m) => !m.entityId);
  const protectedFolderIds = new Set(
    orgLevelMappings.filter((m) => m.status === 'ready').map((m) => m.externalFolderId),
  );

  return {
    connection,
    accessToken,
    adapter: getStorageProviderAdapter(connection.provider),
    organizationRootFolderId: organizationRootMapping.externalFolderId,
    organizationRootMapping,
    mappings: orgLevelMappings,
    protectedFolderIds,
  };
}

async function assertOrgFolderScope(runtime: OrgBrowserRuntime, folderId: string): Promise<void> {
  if (folderId === runtime.organizationRootFolderId) return;
  await assertFolderWithinProjectTree(
    runtime.adapter,
    runtime.accessToken,
    folderId,
    new Set([runtime.organizationRootFolderId]),
  );
}

async function assertOrgFileScope(
  runtime: OrgBrowserRuntime,
  fileId: string,
): Promise<ProviderFileItem> {
  const meta = await runtime.adapter.getFileMetadata(runtime.accessToken, fileId);
  if (!meta?.parentId) {
    throw new NotFoundError('File');
  }
  await assertOrgFolderScope(runtime, meta.parentId);
  return meta;
}

export async function getOrgStorageBrowserContext(
  context: OrgContext,
): Promise<OrgStorageBrowserContext> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const runtime = await resolveOrgBrowserRuntime(context);
  return buildOrgBrowserContext(runtime);
}

export async function loadOrgFileBrowserInitial(
  context: OrgContext,
): Promise<OrgFileBrowserInitialLoad> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const runtime = await resolveOrgBrowserRuntime(context);
  const listing = await runtime.adapter.listFolder(
    runtime.accessToken,
    runtime.organizationRootFolderId,
  );
  const browserContext = buildOrgBrowserContext(runtime);
  return {
    context: browserContext,
    folderExternalId: runtime.organizationRootFolderId,
    folderName: browserContext.organizationRootFolderName,
    folders: listing.folders,
    files: listing.files,
  };
}

export async function browseOrgStorageFolder(
  context: OrgContext,
  input: { folderExternalId?: string | null },
): Promise<OrgBrowserListingResult> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const runtime = await resolveOrgBrowserRuntime(context);
  const folderExternalId = input.folderExternalId?.trim() || runtime.organizationRootFolderId;
  const isOrgRoot = folderExternalId === runtime.organizationRootFolderId;
  await assertOrgFolderScope(runtime, folderExternalId);

  const folderName = isOrgRoot
    ? runtime.organizationRootMapping.displayName
    : ((await runtime.adapter.getFolder(runtime.accessToken, folderExternalId))?.name ?? 'Folder');

  const listing = await runtime.adapter.listFolder(runtime.accessToken, folderExternalId);
  return {
    folderExternalId,
    folderName,
    organizationRootFolderId: runtime.organizationRootFolderId,
    listing,
  };
}

export async function createOrgStorageSubfolder(
  context: OrgContext,
  input: { parentFolderExternalId: string; name: string },
): Promise<ProviderFolderItem> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const runtime = await resolveOrgBrowserRuntime(context);
  await assertOrgFolderScope(runtime, input.parentFolderExternalId);
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

export async function uploadOrgStorageFile(
  context: OrgContext,
  input: {
    parentFolderExternalId: string;
    fileName: string;
    mimeType: string;
    body: ReadableStream<Uint8Array> | Uint8Array;
    sizeBytes: number;
  },
): Promise<ProviderFileItem> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const runtime = await resolveOrgBrowserRuntime(context);
  await assertOrgFolderScope(runtime, input.parentFolderExternalId);

  try {
    return await runtime.adapter.uploadFile(runtime.accessToken, {
      parentFolderId: input.parentFolderExternalId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      body: input.body,
      sizeBytes: input.sizeBytes,
    });
  } catch (error) {
    mapProviderError(error);
  }
}

export async function renameOrgStorageItem(
  context: OrgContext,
  input: {
    itemId: string;
    itemKind: 'file' | 'folder';
    name: string;
  },
): Promise<ProviderFileItem | ProviderFolderItem> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const runtime = await resolveOrgBrowserRuntime(context);
  const name = normalizeBrowserName(input.name);

  try {
    if (input.itemKind === 'folder') {
      await assertOrgFolderScope(runtime, input.itemId);
      if (runtime.protectedFolderIds.has(input.itemId)) {
        throw new DomainRuleError(
          'Cannot rename managed folder',
          'externalStorage.errors.managedFolder',
        );
      }
      return await runtime.adapter.renameFolder(runtime.accessToken, input.itemId, name);
    }

    await assertOrgFileScope(runtime, input.itemId);
    return await runtime.adapter.renameFile(runtime.accessToken, input.itemId, name);
  } catch (error) {
    mapProviderError(error);
  }
}

export async function moveOrgStorageItem(
  context: OrgContext,
  input: {
    itemId: string;
    itemKind: 'file' | 'folder';
    targetFolderExternalId: string;
  },
): Promise<ProviderFileItem | ProviderFolderItem> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const runtime = await resolveOrgBrowserRuntime(context);
  await assertOrgFolderScope(runtime, input.targetFolderExternalId);

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
      await assertOrgFolderScope(runtime, input.itemId);
      return await runtime.adapter.moveFolder(
        runtime.accessToken,
        input.itemId,
        input.targetFolderExternalId,
      );
    }

    await assertOrgFileScope(runtime, input.itemId);
    return await runtime.adapter.moveFile(
      runtime.accessToken,
      input.itemId,
      input.targetFolderExternalId,
    );
  } catch (error) {
    mapProviderError(error);
  }
}

export async function deleteOrgStorageItem(
  context: OrgContext,
  input: { itemId: string; itemKind: 'file' | 'folder' },
): Promise<void> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const runtime = await resolveOrgBrowserRuntime(context);

  try {
    if (input.itemKind === 'folder') {
      if (runtime.protectedFolderIds.has(input.itemId)) {
        throw new DomainRuleError(
          'Cannot delete managed folder',
          'externalStorage.errors.managedFolder',
        );
      }
      await assertOrgFolderScope(runtime, input.itemId);
      const listing = await runtime.adapter.listFolder(runtime.accessToken, input.itemId);
      if (listing.folders.length > 0 || listing.files.length > 0) {
        throw new DomainRuleError('Folder not empty', 'externalStorage.errors.folderNotEmpty');
      }
      await runtime.adapter.deleteFolder(runtime.accessToken, input.itemId);
      return;
    }

    await assertOrgFileScope(runtime, input.itemId);
    await runtime.adapter.deleteFile(runtime.accessToken, input.itemId);
  } catch (error) {
    mapProviderError(error);
  }
}

export async function listOrgStorageMoveTargets(
  context: OrgContext,
  input: { excludeFolderId?: string | null },
): Promise<readonly OrgBrowserFolderTarget[]> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const runtime = await resolveOrgBrowserRuntime(context);
  const rootLabel = runtime.organizationRootMapping.displayName;

  const targets: OrgBrowserFolderTarget[] = [];
  const seen = new Set<string>();
  const queue: Array<{ id: string; pathLabel: string }> = [
    { id: runtime.organizationRootFolderId, pathLabel: rootLabel },
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

export async function streamOrgStorageFileDownload(
  context: OrgContext,
  input: { fileId: string; rangeHeader: string | null },
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
  const runtime = await resolveOrgBrowserRuntime(context);
  const meta = await assertOrgFileScope(runtime, input.fileId);

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

export async function getOrgStorageFileDownloadMeta(
  context: OrgContext,
  input: { fileId: string },
): Promise<{ filename: string; mimeType: string; sizeBytes: number | null }> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const runtime = await resolveOrgBrowserRuntime(context);
  const meta = await assertOrgFileScope(runtime, input.fileId);
  return {
    filename: meta.name,
    mimeType: meta.mimeType ?? 'application/octet-stream',
    sizeBytes: meta.sizeBytes ?? null,
  };
}

export async function getOrgStorageFileDownload(
  context: OrgContext,
  input: { fileId: string; byteRange?: { start: number; end: number } | null },
): Promise<{
  stream: ReadableStream<Uint8Array>;
  filename: string;
  mimeType: string;
  sizeBytes: number | null;
  httpStatus: number;
  contentRange: string | null;
}> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const runtime = await resolveOrgBrowserRuntime(context);
  const meta = await assertOrgFileScope(runtime, input.fileId);
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

export async function getOrgStorageProviderWebUrl(
  context: OrgContext,
  input: { fileId: string },
): Promise<{ url: string; filename: string }> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const runtime = await resolveOrgBrowserRuntime(context);
  const meta = await assertOrgFileScope(runtime, input.fileId);
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
