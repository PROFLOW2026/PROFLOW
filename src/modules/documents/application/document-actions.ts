'use server';

import { getTranslations } from 'next-intl/server';
import {
  createDocumentDownloadUrl,
  finalizeDocumentUpload,
  prepareDocumentUpload,
  type FinalizeUploadInput,
  type PrepareUploadInput,
} from '@/modules/documents';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';

export interface ActionResult {
  error?: string;
}

export interface PrepareUploadActionResult extends ActionResult {
  documentId?: string;
  uploadUrl?: string;
}

export interface DownloadActionResult extends ActionResult {
  url?: string;
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

export async function prepareDocumentUploadAction(
  input: PrepareUploadInput,
): Promise<PrepareUploadActionResult> {
  try {
    const result = await withOrgContext((context) => prepareDocumentUpload(context, input));
    return {
      documentId: result.document.id,
      uploadUrl: result.uploadUrl,
    };
  } catch (error) {
    return { error: await mapDocumentError(error) };
  }
}

export async function finalizeDocumentUploadAction(
  input: FinalizeUploadInput,
): Promise<ActionResult> {
  try {
    await withOrgContext((context) => finalizeDocumentUpload(context, input));
    return {};
  } catch (error) {
    return { error: await mapDocumentError(error) };
  }
}

export async function downloadDocumentAction(input: {
  documentId: string;
}): Promise<DownloadActionResult> {
  const t = await getTranslations('documents.errors');

  try {
    const result = await withOrgContext((context) => createDocumentDownloadUrl(context, input));
    return { url: result.url };
  } catch (error) {
    if (error instanceof AppError) return { error: t('downloadFailed') };
    throw error;
  }
}
