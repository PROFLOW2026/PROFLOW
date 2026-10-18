'use server';

import {
  confirmEmployeeAvatarUpload,
  prepareEmployeeAvatarUpload,
  removeEmployeeAvatar,
} from '@/modules/identity-images';
import { withOrgContext } from '@/shared/auth/session';
import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';

function actionError(error: unknown, fallback: string, t: (key: string) => string): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
    const code = (error as { code: string }).code;
    if (code === 'identityImages.schemaPending') return t('schemaPending');
    if (code === 'identityImages.storageNotConfigured') return t('storageNotConfigured');
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export async function prepareEmployeeAvatarUploadAction(input: {
  employeeId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const t = await getTranslations('workforce.employees.avatar');
  try {
    const result = await withOrgContext((context) => prepareEmployeeAvatarUpload(context, input));
    return {
      ok: true as const,
      storageKey: result.storageKey,
      uploadUrl: result.uploadUrl,
      uploadToken: result.uploadToken,
      uploadPath: result.uploadPath,
    };
  } catch (error) {
    return { error: actionError(error, t('uploadFailed'), t) };
  }
}

export async function confirmEmployeeAvatarUploadAction(input: {
  employeeId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const t = await getTranslations('workforce.employees.avatar');
  try {
    const result = await withOrgContext((context) => confirmEmployeeAvatarUpload(context, input));
    revalidatePath(`/workforce/employees/${input.employeeId}`);
    revalidatePath('/workforce/employees');
    revalidatePath('/employee');
    return { ok: true as const, previewUrl: result.previewUrl };
  } catch (error) {
    return { error: actionError(error, t('uploadFailed'), t) };
  }
}

export async function removeEmployeeAvatarAction(input: { employeeId: string }) {
  const t = await getTranslations('workforce.employees.avatar');
  try {
    await withOrgContext((context) => removeEmployeeAvatar(context, input));
    revalidatePath(`/workforce/employees/${input.employeeId}`);
    revalidatePath('/workforce/employees');
    revalidatePath('/employee');
    return { ok: true as const };
  } catch (error) {
    return { error: actionError(error, t('uploadFailed'), t) };
  }
}
