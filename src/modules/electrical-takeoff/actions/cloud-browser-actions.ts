'use server';

import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';
import { getTranslations } from 'next-intl/server';
import {
  browseTakeoffSourceFolder,
  loadTakeoffSourceBrowserInitial,
} from '../application/takeoff-cloud-browser';

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

export async function loadTakeoffCloudBrowserInitialAction(projectId: string) {
  try {
    const result = await withOrgContext((orgContext) => loadTakeoffSourceBrowserInitial(orgContext, projectId));
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

export async function browseTakeoffCloudFolderAction(input: {
  projectId: string;
  folderExternalId?: string | null;
  folderName?: string | null;
}) {
  try {
    const result = await withOrgContext((orgContext) => browseTakeoffSourceFolder(orgContext, input));
    return {
      folderExternalId: result.folderExternalId,
      folderName: result.folderName,
      projectRootFolderId: result.projectRootFolderId,
      folders: result.folders,
      files: result.files,
    };
  } catch (error) {
    return { error: await mapStorageActionError(error) };
  }
}