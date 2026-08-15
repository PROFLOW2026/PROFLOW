'use server';

import { getTranslations } from 'next-intl/server';
import {
  createDocumentDownloadUrl,
  createDocumentVersionDownloadUrl,
  createFolder,
  finalizeDocumentUpload,
  linkDocumentToEntity,
  listFolders,
  listVersions,
  prepareDocumentUpload,
  prepareNewVersionUpload,
  setDocumentMetadata,
  softDeleteDocument,
  unlinkDocumentFromEntity,
  uploadNewVersion,
  type DocumentFolder,
  type DocumentOwnerType,
  type DocumentVersion,
  type FinalizeUploadInput,
  type PrepareUploadInput,
} from '@/modules/documents';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';
import type { DocumentRuntimeStage } from '../domain/runtime-stage';

export interface ActionResult {
  error?: string;
  errorCode?: DocumentRuntimeStage;
}

export interface PrepareUploadActionResult extends ActionResult {
  documentId?: string;
  uploadUrl?: string;
  uploadToken?: string | null;
  uploadPath?: string;
  uploadBucket?: string;
}

export interface DownloadActionResult extends ActionResult {
  url?: string;
  filename?: string;
}

async function mapDocumentError(error: unknown): Promise<string> {
  const t = await getTranslations('documents.errors');
  if (error instanceof AppError) {
    if (error.messageKey === 'documents.errors.storageNotConfigured') return t('storageNotConfigured');
    if (error.messageKey === 'documents.errors.mimeNotAllowed') return t('mimeNotAllowed');
    if (error.messageKey === 'documents.errors.fileTooLarge') return t('fileTooLarge');
    if (error.messageKey === 'errors.notFound') return t('notFound');
    if (error.messageKey === 'documents.errors.notAvailable') return t('notAvailable');
    if (error.messageKey === 'documents.errors.versionPathInvalid') return t('versionPathInvalid');
    if (error.messageKey === 'documents.errors.folderNotFound') return t('folderNotFound');
    return t('uploadFailed');
  }
  return t('uploadFailed');
}

function prepareErrorCode(error: unknown): DocumentRuntimeStage {
  if (error instanceof AppError) {
    if (error.messageKey === 'documents.errors.signedTargetFailed') return 'signed_target';
    if (error.messageKey === 'documents.errors.storageNotConfigured') return 'prepare';
  }
  return 'prepare';
}

function finalizeErrorCode(error: unknown): DocumentRuntimeStage {
  if (error instanceof AppError && error.messageKey === 'documents.errors.storageVerifyFailed') {
    return 'storage_verify';
  }
  return 'finalize';
}

export async function prepareDocumentUploadAction(
  input: PrepareUploadInput,
): Promise<PrepareUploadActionResult> {
  try {
    const result = await withOrgContext((context) => prepareDocumentUpload(context, input));
    return {
      documentId: result.document.id,
      uploadUrl: result.uploadUrl,
      uploadToken: result.uploadToken,
      uploadPath: result.uploadPath,
      uploadBucket: result.uploadBucket,
    };
  } catch (error) {
    return { error: await mapDocumentError(error), errorCode: prepareErrorCode(error) };
  }
}

export async function finalizeDocumentUploadAction(
  input: FinalizeUploadInput,
): Promise<ActionResult> {
  try {
    await withOrgContext((context) => finalizeDocumentUpload(context, input));
    return {};
  } catch (error) {
    return { error: await mapDocumentError(error), errorCode: finalizeErrorCode(error) };
  }
}

export async function downloadDocumentAction(input: {
  documentId: string;
}): Promise<DownloadActionResult> {
  const t = await getTranslations('documents.errors');

  try {
    const result = await withOrgContext((context) => createDocumentDownloadUrl(context, input));
    return { url: result.url, filename: result.filename };
  } catch (error) {
    if (error instanceof AppError) {
      if (error.messageKey === 'documents.errors.storageNotConfigured') {
        return { error: t('storageNotConfigured'), errorCode: 'preview_download' };
      }
      return { error: t('downloadFailed'), errorCode: 'preview_download' };
    }
    throw error;
  }
}

export async function linkDocumentAction(input: {
  documentId: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  label?: string | null;
  privacyClass?: 'standard' | 'compensation' | null;
}): Promise<ActionResult> {
  const t = await getTranslations('documents.errors');

  try {
    await withOrgContext((context) => linkDocumentToEntity(context, input));
    return {};
  } catch (error) {
    if (error instanceof AppError) {
      if (error.messageKey === 'errors.notFound') return { error: t('notFound') };
      return { error: t('linkFailed') };
    }
    throw error;
  }
}

export async function unlinkDocumentAction(input: { linkId: string }): Promise<ActionResult> {
  const t = await getTranslations('documents.errors');

  try {
    await withOrgContext((context) => unlinkDocumentFromEntity(context, input));
    return {};
  } catch (error) {
    if (error instanceof AppError) {
      if (error.messageKey === 'errors.notFound') return { error: t('notFound') };
      return { error: t('unlinkFailed') };
    }
    throw error;
  }
}

export async function softDeleteDocumentAction(input: {
  documentId: string;
}): Promise<ActionResult> {
  const t = await getTranslations('documents.errors');

  try {
    await withOrgContext((context) => softDeleteDocument(context, input));
    return {};
  } catch (error) {
    if (error instanceof AppError) {
      if (error.messageKey === 'errors.notFound') return { error: t('notFound') };
      return { error: t('deleteFailed') };
    }
    throw error;
  }
}

export interface FolderListActionResult extends ActionResult {
  folders?: readonly DocumentFolder[];
}

export async function listDocumentFoldersAction(input: {
  ownerType?: DocumentOwnerType | null;
  ownerId?: string | null;
}): Promise<FolderListActionResult> {
  const t = await getTranslations('documents.errors');
  try {
    const folders = await withOrgContext((context) => listFolders(context, input));
    return { folders };
  } catch (error) {
    if (error instanceof AppError) {
      return { error: error.messageKey === 'errors.notFound' ? t('notFound') : t('folderNotFound') };
    }
    throw error;
  }
}

export async function createDocumentFolderAction(input: {
  name: string;
  ownerType?: DocumentOwnerType | null;
  ownerId?: string | null;
}): Promise<ActionResult> {
  const t = await getTranslations('documents.errors');
  try {
    await withOrgContext((context) => createFolder(context, input));
    return {};
  } catch (error) {
    if (error instanceof AppError) {
      if (error.messageKey === 'errors.notFound') return { error: t('notFound') };
      return { error: t('folderNotFound') };
    }
    throw error;
  }
}

export interface VersionListActionResult extends ActionResult {
  versions?: readonly DocumentVersion[];
}

export async function listDocumentVersionsAction(input: {
  documentId: string;
}): Promise<VersionListActionResult> {
  const t = await getTranslations('documents.errors');
  try {
    const versions = await withOrgContext((context) => listVersions(context, input));
    return { versions };
  } catch (error) {
    if (error instanceof AppError) {
      return { error: error.messageKey === 'errors.notFound' ? t('notFound') : t('versionNotFound') };
    }
    throw error;
  }
}

export interface PrepareNewVersionActionResult extends ActionResult {
  documentId?: string;
  uploadUrl?: string;
  uploadToken?: string | null;
  uploadPath?: string;
  uploadBucket?: string;
}

export async function prepareNewVersionUploadAction(input: {
  documentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<PrepareNewVersionActionResult> {
  try {
    const result = await withOrgContext((context) => prepareNewVersionUpload(context, input));
    return {
      documentId: result.document.id,
      uploadUrl: result.uploadUrl,
      uploadToken: result.uploadToken,
      uploadPath: result.uploadPath,
      uploadBucket: result.uploadBucket,
    };
  } catch (error) {
    return { error: await mapDocumentError(error), errorCode: prepareErrorCode(error) };
  }
}

export async function finalizeNewVersionUploadAction(input: {
  documentId: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  notes?: string | null;
}): Promise<ActionResult> {
  try {
    await withOrgContext((context) => uploadNewVersion(context, input));
    return {};
  } catch (error) {
    return { error: await mapDocumentError(error), errorCode: finalizeErrorCode(error) };
  }
}

export async function downloadDocumentVersionAction(input: {
  versionId: string;
}): Promise<DownloadActionResult> {
  const t = await getTranslations('documents.errors');
  try {
    const result = await withOrgContext((context) => createDocumentVersionDownloadUrl(context, input));
    return { url: result.url, filename: result.filename };
  } catch (error) {
    if (error instanceof AppError) {
      if (error.messageKey === 'documents.errors.storageNotConfigured') {
        return { error: t('storageNotConfigured') };
      }
      return { error: t('downloadFailed') };
    }
    throw error;
  }
}

export async function setDocumentMetadataAction(input: {
  documentId: string;
  category?: string | null;
  tags?: string | null;
  expiresAt?: string | null;
  isRequired?: boolean;
  requiredType?: string | null;
  folderId?: string | null;
}): Promise<ActionResult> {
  const t = await getTranslations('documents.errors');
  try {
    await withOrgContext((context) => setDocumentMetadata(context, input));
    return {};
  } catch (error) {
    if (error instanceof AppError) {
      if (error.messageKey === 'errors.notFound') return { error: t('notFound') };
      return { error: t('uploadFailed') };
    }
    throw error;
  }
}
