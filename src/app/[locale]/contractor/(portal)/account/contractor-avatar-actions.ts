'use server';

import {
  confirmContractorAvatarUpload,
  prepareContractorAvatarUpload,
  removeContractorAvatar,
} from '@/modules/identity-images';
import { requireExternalContext } from '@/modules/contractor-access';
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

export async function prepareContractorAvatarUploadAction(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const t = await getTranslations('contractorAccess.account.avatar');
  try {
    const context = await requireExternalContext();
    const result = await prepareContractorAvatarUpload(context, input);
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

export async function confirmContractorAvatarUploadAction(input: {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const t = await getTranslations('contractorAccess.account.avatar');
  try {
    const context = await requireExternalContext();
    const result = await confirmContractorAvatarUpload(context, input);
    revalidatePath('/contractor/account');
    revalidatePath('/contractor');
    return { ok: true as const, previewUrl: result.previewUrl };
  } catch (error) {
    return { error: actionError(error, t('uploadFailed'), t) };
  }
}

export async function removeContractorAvatarAction() {
  const t = await getTranslations('contractorAccess.account.avatar');
  try {
    const context = await requireExternalContext();
    await removeContractorAvatar(context);
    revalidatePath('/contractor/account');
    revalidatePath('/contractor');
    return { ok: true as const };
  } catch (error) {
    return { error: actionError(error, t('uploadFailed'), t) };
  }
}
