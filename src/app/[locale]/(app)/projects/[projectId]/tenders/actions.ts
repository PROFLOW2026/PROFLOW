'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  awardTenderToSubcontract,
  closeTenderBidding,
  createTenderPackage,
  inviteVendorToTender,
} from '@/modules/contractor-procurement';
import {
  awardTenderSchema,
  closeTenderBiddingSchema,
  createTenderPackageSchema,
  inviteVendorSchema,
} from '@/modules/contractor-procurement/validation/schemas';
import type { SubcontractFormState } from '@/modules/subcontracts/ui/form-state';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

async function mapTenderError(error: unknown): Promise<SubcontractFormState> {
  const [tErrors, tAwards] = await Promise.all([getTranslations('errors'), getTranslations('awards')]);
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: { awards: (key) => tAwards(key as never) },
  });
}

export async function createTenderPackageAction(
  _prev: SubcontractFormState,
  formData: FormData,
): Promise<SubcontractFormState> {
  const parsed = createTenderPackageSchema.safeParse({
    projectId: field(formData, 'projectId'),
    tradeKey: field(formData, 'tradeKey'),
    title: field(formData, 'title'),
    scopeDescription: field(formData, 'scopeDescription') || undefined,
    workPackageId: field(formData, 'workPackageId') || undefined,
  });
  if (!parsed.success) return { error: 'validation' };

  try {
    const result = await withOrgContext((context) => createTenderPackage(context, parsed.data));
    revalidatePath(`/projects/${parsed.data.projectId}/tenders`);
    return { success: true, createdId: result.packageId };
  } catch (error) {
    return mapTenderError(error);
  }
}

export async function inviteVendorToTenderAction(
  _prev: SubcontractFormState,
  formData: FormData,
): Promise<SubcontractFormState> {
  const parsed = inviteVendorSchema.safeParse({
    projectId: field(formData, 'projectId'),
    packageId: field(formData, 'packageId'),
    vendorId: field(formData, 'vendorId'),
  });
  if (!parsed.success) return { error: 'validation' };

  try {
    await withOrgContext((context) => inviteVendorToTender(context, parsed.data));
    revalidatePath(`/projects/${parsed.data.projectId}/tenders/${parsed.data.packageId}`);
    return { success: true };
  } catch (error) {
    return mapTenderError(error);
  }
}

export async function closeTenderBiddingAction(
  _prev: SubcontractFormState,
  formData: FormData,
): Promise<SubcontractFormState> {
  const parsed = closeTenderBiddingSchema.safeParse({
    projectId: field(formData, 'projectId'),
    packageId: field(formData, 'packageId'),
  });
  if (!parsed.success) return { error: 'validation' };

  try {
    await withOrgContext((context) => closeTenderBidding(context, parsed.data));
    revalidatePath(`/projects/${parsed.data.projectId}/tenders/${parsed.data.packageId}`);
    return { success: true };
  } catch (error) {
    return mapTenderError(error);
  }
}

export async function awardTenderAction(
  _prev: SubcontractFormState,
  formData: FormData,
): Promise<SubcontractFormState> {
  const parsed = awardTenderSchema.safeParse({
    projectId: field(formData, 'projectId'),
    packageId: field(formData, 'packageId'),
    offerId: field(formData, 'offerId'),
    subcontractNumber: field(formData, 'subcontractNumber') || undefined,
    title: field(formData, 'title') || undefined,
  });
  if (!parsed.success) return { error: 'validation' };

  try {
    const result = await withOrgContext((context) => awardTenderToSubcontract(context, parsed.data));
    revalidatePath(`/projects/${parsed.data.projectId}/tenders/${parsed.data.packageId}`);
    return { success: true, createdId: result.agreementId };
  } catch (error) {
    return mapTenderError(error);
  }
}
