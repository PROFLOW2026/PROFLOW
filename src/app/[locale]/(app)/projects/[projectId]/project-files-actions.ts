'use server';

import {
  browseProjectStorageFolder,
  createProjectStorageSubfolder,
  deleteProjectStorageItem,
  getProjectStorageBrowserContext,
  getProjectStorageProviderWebUrl,
  listProjectStorageMoveTargets,
  loadProjectFileBrowserInitial,
  moveProjectStorageItem,
  renameProjectStorageItem,
} from '@/modules/external-storage/server';
import { withOrgContext } from '@/shared/auth/session';
import { getTranslations } from 'next-intl/server';
import { AppError } from '@/shared/errors';

const STORAGE_ERROR_KEYS = [
  'notConnected',
  'quotaFull',
  'fileUnavailable',
  'reconnectRequired',
  'providerNotConfigured',
  'connectionNotFound',
  'outOfScope',
  'folderNotEmpty',
  'invalidName',
  'managedFolder',
  'invalidMoveTarget',
  'operationFailed',
] as const;

type StorageErrorKey = (typeof STORAGE_ERROR_KEYS)[number];

function isStorageErrorKey(value: string): value is StorageErrorKey {
  return (STORAGE_ERROR_KEYS as readonly string[]).includes(value);
}

async function mapStorageActionError(error: unknown): Promise<string> {
  const t = await getTranslations('externalStorage.errors');
  if (error instanceof AppError && error.messageKey) {
    const key = error.messageKey.replace(/^externalStorage\.errors\./, '');
    if (isStorageErrorKey(key)) return t(key);
  }
  return t('operationFailed');
}

export async function getProjectFileBrowserContextAction(projectId: string) {
  try {
    const context = await withOrgContext((orgContext) =>
      getProjectStorageBrowserContext(orgContext, projectId),
    );
    return { context };
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}

export async function loadProjectFileBrowserInitialAction(projectId: string) {
  try {
    const result = await withOrgContext((orgContext) =>
      loadProjectFileBrowserInitial(orgContext, projectId),
    );
    return {
      context: result.context,
      folderExternalId: result.folderExternalId,
      folderName: result.folderName,
      folders: result.folders,
      files: result.files,
    };
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}

export async function browseProjectFolderAction(input: {
  projectId: string;
  folderExternalId?: string | null;
  folderName?: string | null;
}) {
  try {
    const result = await withOrgContext((context) =>
      browseProjectStorageFolder(context, input),
    );
    return {
      folderExternalId: result.folderExternalId,
      folderName: result.folderName,
      projectRootFolderId: result.projectRootFolderId,
      folders: result.listing.folders,
      files: result.listing.files,
    };
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}

export async function createProjectSubfolderAction(input: {
  projectId: string;
  parentFolderExternalId: string;
  name: string;
}) {
  try {
    const folder = await withOrgContext((context) =>
      createProjectStorageSubfolder(context, input),
    );
    return { folder };
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}

export async function renameProjectStorageItemAction(input: {
  projectId: string;
  itemId: string;
  itemKind: 'file' | 'folder';
  name: string;
}) {
  try {
    const item = await withOrgContext((context) => renameProjectStorageItem(context, input));
    return { item };
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}

export async function moveProjectStorageItemAction(input: {
  projectId: string;
  itemId: string;
  itemKind: 'file' | 'folder';
  targetFolderExternalId: string;
}) {
  try {
    const item = await withOrgContext((context) => moveProjectStorageItem(context, input));
    return { item };
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}

export async function deleteProjectStorageItemAction(input: {
  projectId: string;
  itemId: string;
  itemKind: 'file' | 'folder';
}) {
  try {
    await withOrgContext((context) => deleteProjectStorageItem(context, input));
    return {};
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}

export async function listProjectMoveTargetsAction(input: {
  projectId: string;
  excludeFolderId?: string | null;
}) {
  try {
    const targets = await withOrgContext((context) =>
      listProjectStorageMoveTargets(context, input),
    );
    return { targets };
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}

export async function getProjectFileProviderUrlAction(input: {
  projectId: string;
  fileId: string;
}) {
  try {
    const result = await withOrgContext((context) =>
      getProjectStorageProviderWebUrl(context, input),
    );
    return { url: result.url, filename: result.filename };
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}
