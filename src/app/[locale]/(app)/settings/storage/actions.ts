'use server';

import {
  approveProjectTemplateAndProvision,
  disconnectStorageConnection,
  openProjectTemplateInProvider,
  setPrimaryStorageConnection,
  validateStorageConnection,
} from '@/modules/external-storage/server';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';
import { getTranslations } from 'next-intl/server';

export interface StorageActionResult {
  error?: string;
  ok?: boolean;
  webUrl?: string | null;
}

async function mapError(error: unknown): Promise<string> {
  const t = await getTranslations('externalStorage.errors');
  if (error instanceof AppError && error.messageKey?.startsWith('externalStorage.')) {
    const key = error.messageKey.replace('externalStorage.errors.', '') as 'notConnected';
    return t(key);
  }
  return t('connectionNotFound');
}

export async function validateStorageConnectionAction(
  connectionId: string,
): Promise<StorageActionResult> {
  try {
    await withOrgContext((context) => validateStorageConnection(context, connectionId));
    return { ok: true };
  } catch (error) {
    return { error: await mapError(error) };
  }
}

export async function disconnectStorageConnectionAction(
  connectionId: string,
): Promise<StorageActionResult> {
  try {
    await withOrgContext((context) => disconnectStorageConnection(context, connectionId));
    return { ok: true };
  } catch (error) {
    return { error: await mapError(error) };
  }
}

export async function setPrimaryStorageConnectionAction(
  connectionId: string,
): Promise<StorageActionResult> {
  try {
    await withOrgContext((context) => setPrimaryStorageConnection(context, connectionId));
    return { ok: true };
  } catch (error) {
    return { error: await mapError(error) };
  }
}

export async function approveProjectTemplateAction(
  connectionId: string,
): Promise<StorageActionResult> {
  try {
    await withOrgContext((context) => approveProjectTemplateAndProvision(context, connectionId));
    return { ok: true };
  } catch (error) {
    return { error: await mapError(error) };
  }
}

export async function openProjectTemplateAction(
  connectionId: string,
): Promise<StorageActionResult> {
  try {
    const result = await withOrgContext((context) =>
      openProjectTemplateInProvider(context, connectionId),
    );
    return { ok: true, webUrl: result.webUrl };
  } catch (error) {
    return { error: await mapError(error) };
  }
}
