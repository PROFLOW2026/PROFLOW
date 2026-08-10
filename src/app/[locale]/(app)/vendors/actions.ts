'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  archiveVendor,
  cancelVendorEngagement,
  createVendor,
  createVendorContact,
  createVendorEngagement,
  createEngagementSchema,
  cancelEngagementSchema,
  endEngagementSchema,
  endVendorEngagement,
  restoreVendor,
  updateVendor,
  type CreateVendorInput,
  type UpdateVendorInput,
} from '@/modules/vendors';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface VendorFormState {
  error?: string;
  ok?: boolean;
}

export async function createVendorAction(
  _prev: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  const t = await getTranslations('errors');
  const locale = await getLocale();

  const input: CreateVendorInput = {
    name: String(formData.get('name') ?? ''),
    type: (formData.get('type') as CreateVendorInput['type']) || undefined,
    email: String(formData.get('email') ?? '') || undefined,
    phone: String(formData.get('phone') ?? '') || undefined,
    website: String(formData.get('website') ?? '') || undefined,
    addressLine1: String(formData.get('addressLine1') ?? '') || undefined,
    city: String(formData.get('city') ?? '') || undefined,
    countryCode: String(formData.get('countryCode') ?? '') || undefined,
    notes: String(formData.get('notes') ?? '') || undefined,
  };

  try {
    const vendor = await withOrgContext((context) => createVendor(context, input));
    revalidatePath('/vendors');
    redirect({ href: `/vendors/${vendor.id}`, locale });
  } catch (error) {
    if (error instanceof AppError) return { error: t('validationFailed') };
    throw error;
  }

  return {};
}

export async function updateVendorAction(
  _prev: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  const t = await getTranslations('errors');

  const input: UpdateVendorInput = {
    vendorId: String(formData.get('vendorId') ?? ''),
    name: String(formData.get('name') ?? '') || undefined,
    type: (formData.get('type') as UpdateVendorInput['type']) || undefined,
    email: String(formData.get('email') ?? '') || undefined,
    phone: String(formData.get('phone') ?? '') || undefined,
    website: String(formData.get('website') ?? '') || undefined,
    addressLine1: String(formData.get('addressLine1') ?? '') || undefined,
    city: String(formData.get('city') ?? '') || undefined,
    countryCode: String(formData.get('countryCode') ?? '') || undefined,
    notes: String(formData.get('notes') ?? '') || undefined,
  };

  try {
    await withOrgContext((context) => updateVendor(context, input));
    revalidatePath('/vendors');
    return {};
  } catch (error) {
    if (error instanceof AppError) return { error: t('validationFailed') };
    throw error;
  }
}

export async function archiveVendorAction(vendorId: string): Promise<VendorFormState> {
  const t = await getTranslations('errors');
  const locale = await getLocale();

  try {
    await withOrgContext((context) => archiveVendor(context, { vendorId }));
    revalidatePath('/vendors');
    redirect({ href: '/vendors', locale });
  } catch (error) {
    if (error instanceof AppError) return { error: t('unexpected') };
    throw error;
  }

  return {};
}

export async function restoreVendorAction(vendorId: string): Promise<VendorFormState> {
  const t = await getTranslations('errors');

  try {
    await withOrgContext((context) => restoreVendor(context, { vendorId }));
    revalidatePath('/vendors');
    revalidatePath(`/vendors/${vendorId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: t('unexpected') };
    throw error;
  }
}

export async function addVendorContactAction(
  _prev: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  const t = await getTranslations('errors');

  try {
    await withOrgContext((context) =>
      createVendorContact(context, {
        vendorId: String(formData.get('vendorId') ?? ''),
        name: String(formData.get('name') ?? ''),
        role: (formData.get('role') as 'primary') || undefined,
        email: String(formData.get('email') ?? '') || undefined,
        phone: String(formData.get('phone') ?? '') || undefined,
      }),
    );
    revalidatePath('/vendors');
    return {};
  } catch (error) {
    if (error instanceof AppError) return { error: t('validationFailed') };
    throw error;
  }
}

export async function addVendorEngagementAction(
  _prev: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  const t = await getTranslations('errors');

  const parsed = createEngagementSchema.safeParse({
    vendorId: formData.get('vendorId'),
    projectId: formData.get('projectId'),
    role: formData.get('role') || null,
    notes: formData.get('notes') || null,
    startDate: formData.get('startDate') || null,
    endDate: formData.get('endDate') || null,
  });

  if (!parsed.success) {
    return { error: t('validationFailed') };
  }

  try {
    await withOrgContext((context) => createVendorEngagement(context, parsed.data));
    revalidatePath('/vendors');
    revalidatePath(`/vendors/${parsed.data.vendorId}`);
    revalidatePath(`/projects/${parsed.data.projectId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: t('validationFailed') };
    throw error;
  }
}

export async function endVendorEngagementAction(input: {
  engagementId: string;
  projectId: string;
  vendorId: string;
  endDate?: string | null;
}): Promise<VendorFormState> {
  const t = await getTranslations('errors');

  const parsed = endEngagementSchema.safeParse({
    engagementId: input.engagementId,
    endDate: input.endDate ?? null,
  });
  if (!parsed.success) {
    return { error: t('validationFailed') };
  }

  try {
    await withOrgContext((context) => endVendorEngagement(context, parsed.data));
    revalidatePath('/vendors');
    revalidatePath(`/vendors/${input.vendorId}`);
    revalidatePath(`/projects/${input.projectId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: t('unexpected') };
    throw error;
  }
}

export async function cancelVendorEngagementAction(input: {
  engagementId: string;
  projectId: string;
  vendorId: string;
  endDate?: string | null;
}): Promise<VendorFormState> {
  const t = await getTranslations('errors');

  const parsed = cancelEngagementSchema.safeParse({
    engagementId: input.engagementId,
    endDate: input.endDate ?? null,
  });
  if (!parsed.success) {
    return { error: t('validationFailed') };
  }

  try {
    await withOrgContext((context) => cancelVendorEngagement(context, parsed.data));
    revalidatePath('/vendors');
    revalidatePath(`/vendors/${input.vendorId}`);
    revalidatePath(`/projects/${input.projectId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: t('unexpected') };
    throw error;
  }
}
