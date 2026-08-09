'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  archiveVendor,
  createVendor,
  createVendorContact,
  createVendorEngagement,
  updateVendor,
  type CreateVendorInput,
  type UpdateVendorInput,
} from '@/modules/vendors';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface VendorFormState {
  error?: string;
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

  try {
    await withOrgContext((context) =>
      createVendorEngagement(context, {
        vendorId: String(formData.get('vendorId') ?? ''),
        projectId: String(formData.get('projectId') ?? ''),
        role: String(formData.get('role') ?? '') || undefined,
      }),
    );
    revalidatePath('/vendors');
    return {};
  } catch (error) {
    if (error instanceof AppError) return { error: t('validationFailed') };
    throw error;
  }
}
