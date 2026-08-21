'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  archiveBrandProfile,
  confirmBrandAssetUpload,
  prepareBrandAssetUpload,
  removeBrandAsset,
  setDefaultBrandProfile,
  upsertOrganizationBrandProfile,
  type BrandAssetKind,
} from '@/modules/branding';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';
import type { SettingsActionState } from '../actions';

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function formBool(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on' || formData.get(key) === 'true' || formData.get(key) === '1';
}

function formNullableText(formData: FormData, key: string): string | null {
  return formValue(formData, key) ?? null;
}

function revalidateBranding() {
  revalidatePath('/settings/branding');
  revalidatePath('/settings/business');
  revalidatePath('/', 'layout');
}

export async function updateBrandProfileAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const brandProfileId = formValue(formData, 'brandProfileId');
  const name = formValue(formData, 'name');
  if (!brandProfileId || !name) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) =>
      upsertOrganizationBrandProfile(context, {
        brandProfileId,
        name,
        primaryColor: formValue(formData, 'primaryColor'),
        secondaryColor: formValue(formData, 'secondaryColor'),
        headerLayout: formValue(formData, 'headerLayout') as
          | 'letterhead'
          | 'logo_sides'
          | 'centered'
          | 'minimal'
          | undefined,
        footerStyle: formValue(formData, 'footerStyle') as 'minimal' | 'detailed' | 'legal' | undefined,
        showLogo: formBool(formData, 'showLogo'),
        showLegalName: formBool(formData, 'showLegalName'),
        showDisplayName: formBool(formData, 'showDisplayName'),
        showRegistrationNumber: formBool(formData, 'showRegistrationNumber'),
        showVatTaxId: formBool(formData, 'showVatTaxId'),
        showAddress: formBool(formData, 'showAddress'),
        showPhone: formBool(formData, 'showPhone'),
        showEmail: formBool(formData, 'showEmail'),
        showWebsite: formBool(formData, 'showWebsite'),
        showPageNumbers: formBool(formData, 'showPageNumbers'),
        showGeneratedDate: formBool(formData, 'showGeneratedDate'),
        showDocumentReference: formBool(formData, 'showDocumentReference'),
        allowSignatureOnQuotes: formBool(formData, 'allowSignatureOnQuotes'),
        allowSignatureOnReports: formBool(formData, 'allowSignatureOnReports'),
        allowStamp: formBool(formData, 'allowStamp'),
        includeSignatureByDefault: formBool(formData, 'includeSignatureByDefault'),
        includeStampByDefault: formBool(formData, 'includeStampByDefault'),
        footerCustomText: formNullableText(formData, 'footerCustomText'),
        quoteFooterText: formNullableText(formData, 'quoteFooterText'),
        quoteTermsText: formNullableText(formData, 'quoteTermsText'),
        reportFooterText: formNullableText(formData, 'reportFooterText'),
        paymentInstructionsText: formNullableText(formData, 'paymentInstructionsText'),
        generalDocumentNote: formNullableText(formData, 'generalDocumentNote'),
        emailSignatureText: formNullableText(formData, 'emailSignatureText'),
        poTermsText: formNullableText(formData, 'poTermsText'),
        serviceReportNote: formNullableText(formData, 'serviceReportNote'),
        reportDisclaimerText: formNullableText(formData, 'reportDisclaimerText'),
      }),
    );
    revalidateBranding();
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function createBrandProfileAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const name = formValue(formData, 'name');
  if (!name) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => upsertOrganizationBrandProfile(context, { name }));
    revalidateBranding();
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function setDefaultBrandProfileAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const brandProfileId = formValue(formData, 'brandProfileId');
  if (!brandProfileId) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => setDefaultBrandProfile(context, brandProfileId));
    revalidateBranding();
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function archiveBrandProfileAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const brandProfileId = formValue(formData, 'brandProfileId');
  if (!brandProfileId) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => archiveBrandProfile(context, brandProfileId));
    revalidateBranding();
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function removeBrandAssetAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const brandProfileId = formValue(formData, 'brandProfileId');
  const kind = formValue(formData, 'assetKind') as BrandAssetKind | undefined;
  if (!brandProfileId || !kind) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => removeBrandAsset(context, { brandProfileId, kind }));
    revalidateBranding();
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export interface PrepareBrandAssetResult {
  ok?: boolean;
  error?: string;
  uploadUrl?: string;
  storageKey?: string;
  uploadToken?: string | null;
  uploadPath?: string;
}

export async function prepareBrandAssetUploadAction(input: {
  brandProfileId: string;
  assetKind: BrandAssetKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<PrepareBrandAssetResult> {
  const tErrors = await getTranslations('errors');
  try {
    const prepared = await withOrgContext((context) =>
      prepareBrandAssetUpload(context, {
        brandProfileId: input.brandProfileId,
        kind: input.assetKind,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      }),
    );
    return {
      ok: true,
      uploadUrl: prepared.uploadUrl,
      storageKey: prepared.storageKey,
      uploadToken: prepared.token,
      uploadPath: prepared.path,
    };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function confirmBrandAssetUploadAction(input: {
  brandProfileId: string;
  assetKind: BrandAssetKind;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
}): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) =>
      confirmBrandAssetUpload(context, {
        brandProfileId: input.brandProfileId,
        kind: input.assetKind,
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        width: input.width,
        height: input.height,
      }),
    );
    revalidateBranding();
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}
