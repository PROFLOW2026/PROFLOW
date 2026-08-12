'use server';

import { getTranslations } from 'next-intl/server';
import {
  createDocumentDownloadUrl,
  finalizeDocumentUpload,
  linkDocumentToEntity,
  prepareDocumentUpload,
  softDeleteDocument,
  unlinkDocumentFromEntity,
  type DocumentOwnerType,
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
