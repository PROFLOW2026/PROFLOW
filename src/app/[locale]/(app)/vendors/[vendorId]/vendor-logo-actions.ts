'use server';

import {
  confirmVendorLogoUpload,
  prepareVendorLogoUpload,
  removeVendorLogo,
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

export async function prepareVendorLogoUploadAction(input: {
  vendorId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const t = await getTranslations('vendors.logo');
  try {
    const result = await withOrgContext((context) => prepareVendorLogoUpload(context, input));
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

export async function confirmVendorLogoUploadAction(input: {
  vendorId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const t = await getTranslations('vendors.logo');
  try {
    const result = await withOrgContext((context) => confirmVendorLogoUpload(context, input));
    revalidatePath(`/vendors/${input.vendorId}`);
    revalidatePath('/vendors');
    return { ok: true as const, previewUrl: result.previewUrl };
  } catch (error) {
    return { error: actionError(error, t('uploadFailed'), t) };
  }
}

export async function removeVendorLogoAction(input: { vendorId: string }) {
  const t = await getTranslations('vendors.logo');
  try {
    await withOrgContext((context) => removeVendorLogo(context, input));
    revalidatePath(`/vendors/${input.vendorId}`);
    revalidatePath('/vendors');
    return { ok: true as const };
  } catch (error) {
    return { error: actionError(error, t('uploadFailed'), t) };
  }
}
