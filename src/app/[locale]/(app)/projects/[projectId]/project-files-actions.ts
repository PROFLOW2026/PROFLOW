'use server';

import {
  browseProjectStorageFolder,
  createProjectStorageSubfolder,
  deleteProjectStorageItem,
  getProjectStorageFileDownload,
  listProjectStorageMoveTargets,
  moveProjectStorageItem,
  renameProjectStorageItem,
} from '@/modules/external-storage/server';
import type { SemanticFolderType } from '@/modules/external-storage/server';
import { withOrgContext } from '@/shared/auth/session';
import { serverEnv } from '@/shared/env/server';
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

export async function browseProjectFolderAction(input: {
  projectId: string;
  semanticFolderType: SemanticFolderType;
  folderExternalId?: string | null;
}) {
  try {
    const result = await withOrgContext((context) =>
      browseProjectStorageFolder(context, input),
    );
    return {
      folderExternalId: result.folderExternalId,
      folderName: result.folderName,
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

export async function getProjectFileDownloadAction(input: {
  projectId: string;
  fileId: string;
}) {
  try {
    const payload = await withOrgContext((context) =>
      getProjectStorageFileDownload(context, input),
    );
    if ('url' in payload) {
      return { url: payload.url, filename: payload.filename };
    }
    const baseUrl = serverEnv().APP_URL.replace(/\/+$/, '');
    const params = new URLSearchParams({
      projectId: input.projectId,
      fileId: input.fileId,
    });
    return {
      url: `${baseUrl}/api/org-storage/browser-download?${params.toString()}`,
      filename: payload.filename,
    };
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}

/** @deprecated Use browseProjectFolderAction */
export async function listProjectFolderAction(input: {
  projectId: string;
  semanticFolderType: SemanticFolderType;
}) {
  return browseProjectFolderAction(input);
}
