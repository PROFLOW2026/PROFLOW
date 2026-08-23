'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  createWarrantyCoverage,
  createWarrantyIssue,
  createWarrantyIssueWorkOrder,
  updateWarrantyCoverage,
  updateWarrantyIssue,
  type WarrantyCoverageType,
  type WarrantyIssueStatus,
} from '@/modules/warranty';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';

export interface WarrantyFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value == null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function requiredFormValue(formData: FormData, key: string): string {
  return formValue(formData, key) ?? '';
}

async function mapError(error: unknown): Promise<WarrantyFormState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('warranty');
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: {
      warranty: (key) => t(key as 'errors.dates'),
    },
  });
}

function revalidateWarranty(projectId?: string) {
  revalidatePath('/warranty');
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

export async function createWarrantyCoverageAction(
  _prev: WarrantyFormState,
  formData: FormData,
): Promise<WarrantyFormState> {
  const projectId = requiredFormValue(formData, 'projectId');
  try {
    await withOrgContext((context) =>
      createWarrantyCoverage(context, {
        projectId,
        title: requiredFormValue(formData, 'title'),
        coverageType: (formValue(formData, 'coverageType') as WarrantyCoverageType | undefined) ?? 'workmanship',
        workPackageId: formValue(formData, 'workPackageId'),
        vendorId: formValue(formData, 'vendorId'),
        startDate: formValue(formData, 'startDate'),
        endDate: formValue(formData, 'endDate'),
        notes: formValue(formData, 'notes'),
        reminderDaysBefore: formValue(formData, 'reminderDaysBefore')
          ? Number(formValue(formData, 'reminderDaysBefore'))
          : 30,
      }),
    );
    revalidateWarranty(projectId);
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function voidWarrantyCoverageAction(
  _prev: WarrantyFormState,
  formData: FormData,
): Promise<WarrantyFormState> {
  const projectId = formValue(formData, 'projectId');
  try {
    await withOrgContext((context) =>
      updateWarrantyCoverage(context, {
        coverageId: requiredFormValue(formData, 'coverageId'),
        status: 'void',
      }),
    );
    revalidateWarranty(projectId);
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function createWarrantyIssueAction(
  _prev: WarrantyFormState,
  formData: FormData,
): Promise<WarrantyFormState> {
  const projectId = formValue(formData, 'projectId');
  try {
    await withOrgContext((context) =>
      createWarrantyIssue(context, {
        coverageId: requiredFormValue(formData, 'coverageId'),
        title: requiredFormValue(formData, 'title'),
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidateWarranty(projectId);
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function updateWarrantyIssueStatusAction(
  _prev: WarrantyFormState,
  formData: FormData,
): Promise<WarrantyFormState> {
  const projectId = formValue(formData, 'projectId');
  try {
    await withOrgContext((context) =>
      updateWarrantyIssue(context, {
        issueId: requiredFormValue(formData, 'issueId'),
        status: requiredFormValue(formData, 'status') as WarrantyIssueStatus,
      }),
    );
    revalidateWarranty(projectId);
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function createWarrantyWorkOrderAction(
  _prev: WarrantyFormState,
  formData: FormData,
): Promise<WarrantyFormState> {
  const projectId = formValue(formData, 'projectId');
  try {
    await withOrgContext((context) =>
      createWarrantyIssueWorkOrder(context, {
        issueId: requiredFormValue(formData, 'issueId'),
        name: formValue(formData, 'name'),
      }),
    );
    revalidateWarranty(projectId);
    revalidatePath('/work-orders');
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}
