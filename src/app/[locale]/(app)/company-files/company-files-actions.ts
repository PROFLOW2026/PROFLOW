'use server';

import {
  browseOrgStorageFolder,
  createOrgStorageSubfolder,
  deleteOrgStorageItem,
  getOrgStorageProviderWebUrl,
  listOrgStorageMoveTargets,
  loadOrgFileBrowserInitial,
  moveOrgStorageItem,
  renameOrgStorageItem,
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

export async function loadCompanyFileBrowserInitialAction() {
  try {
    const result = await withOrgContext((orgContext) => loadOrgFileBrowserInitial(orgContext));
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

export async function browseCompanyFolderAction(input: { folderExternalId?: string | null }) {
  try {
    const result = await withOrgContext((context) => browseOrgStorageFolder(context, input));
    return {
      folderExternalId: result.folderExternalId,
      folderName: result.folderName,
      organizationRootFolderId: result.organizationRootFolderId,
      folders: result.listing.folders,
      files: result.listing.files,
    };
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}

export async function createCompanySubfolderAction(input: {
  parentFolderExternalId: string;
  name: string;
}) {
  try {
    const folder = await withOrgContext((context) => createOrgStorageSubfolder(context, input));
    return { folder };
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}

export async function renameCompanyStorageItemAction(input: {
  itemId: string;
  itemKind: 'file' | 'folder';
  name: string;
}) {
  try {
    const item = await withOrgContext((context) => renameOrgStorageItem(context, input));
    return { item };
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}

export async function moveCompanyStorageItemAction(input: {
  itemId: string;
  itemKind: 'file' | 'folder';
  targetFolderExternalId: string;
}) {
  try {
    const item = await withOrgContext((context) => moveOrgStorageItem(context, input));
    return { item };
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}

export async function deleteCompanyStorageItemAction(input: {
  itemId: string;
  itemKind: 'file' | 'folder';
}) {
  try {
    await withOrgContext((context) => deleteOrgStorageItem(context, input));
    return {};
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}

export async function listCompanyMoveTargetsAction(input: { excludeFolderId?: string | null }) {
  try {
    const targets = await withOrgContext((context) => listOrgStorageMoveTargets(context, input));
    return { targets };
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}

export async function getCompanyFileProviderUrlAction(input: { fileId: string }) {
  try {
    const result = await withOrgContext((context) => getOrgStorageProviderWebUrl(context, input));
    return { url: result.url, filename: result.filename };
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}
