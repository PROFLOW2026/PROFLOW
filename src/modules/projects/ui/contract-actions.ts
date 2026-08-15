'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  createAdditionalContract,
  updateContract,
  setProjectPrimaryContract,
} from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, ValidationError } from '@/shared/errors';

export interface ContractFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null || value === '') return undefined;
  return String(value);
}

/** Present empty fields as null so optional metadata can be cleared. */
function formValueOrNull(formData: FormData, key: string): string | null | undefined {
  if (!formData.has(key)) return undefined;
  const value = formData.get(key);
  if (value === null || String(value).trim() === '') return null;
  return String(value);
}

export async function createAdditionalContractAction(
  _prev: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const t = await getTranslations('projects.contracts');
  const projectId = String(formData.get('projectId') ?? '');
  try {
    await withOrgContext((context) =>
      createAdditionalContract(context, {
        projectId,
        name: formValue(formData, 'name'),
        contractNumber: formValue(formData, 'contractNumber'),
        contractType:
          formData.get('contractType') === 'secondary' ? 'secondary' : 'additional',
        enteredAmount: formValue(formData, 'enteredAmount'),
        currency: formValue(formData, 'currency'),
        amountIncludesTax: formData.get('amountIncludesTax') === 'including',
        startDate: formValue(formData, 'startDate'),
        endDate: formValue(formData, 'endDate'),
        retentionPercent: formValue(formData, 'retentionPercent'),
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}`, 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        if (issue.path) fieldErrors[issue.path] = issue.message;
      }
      return { error: t('errors.saveFailed'), fieldErrors };
    }
    if (error instanceof AppError) {
      return { error: t('errors.saveFailed') };
    }
    throw error;
  }
}

export async function setPrimaryContractAction(
  _prev: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const t = await getTranslations('projects.contracts');
  const projectId = String(formData.get('projectId') ?? '');
  const contractId = formValue(formData, 'contractId') ?? null;
  try {
    await withOrgContext((context) =>
      setProjectPrimaryContract(context, { projectId, contractId }),
    );
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}`, 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: t('errors.saveFailed') };
    throw error;
  }
}

export async function updateContractAction(
  _prev: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const t = await getTranslations('projects.contracts');
  const projectId = String(formData.get('projectId') ?? '');
  const contractTypeRaw = formValue(formData, 'contractType');
  const statusRaw = formValue(formData, 'status');
  try {
    await withOrgContext((context) =>
      updateContract(context, {
        contractId: String(formData.get('contractId') ?? ''),
        name: formValueOrNull(formData, 'name'),
        contractNumber: formValueOrNull(formData, 'contractNumber'),
        contractType:
          contractTypeRaw === 'secondary' || contractTypeRaw === 'additional'
            ? contractTypeRaw
            : undefined,
        startDate: formValueOrNull(formData, 'startDate'),
        endDate: formValueOrNull(formData, 'endDate'),
        retentionPercent: formValueOrNull(formData, 'retentionPercent'),
        notes: formValueOrNull(formData, 'notes'),
        status:
          statusRaw === 'draft' ||
          statusRaw === 'active' ||
          statusRaw === 'closed' ||
          statusRaw === 'cancelled'
            ? statusRaw
            : undefined,
      }),
    );
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}`, 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        if (issue.path) fieldErrors[issue.path] = issue.message;
      }
      return { error: t('errors.saveFailed'), fieldErrors };
    }
    if (error instanceof AppError) {
      if (error.messageKey === 'projects.contracts.errors.invalidStatus') {
        return { error: t('errors.invalidStatus') };
      }
      return { error: t('errors.saveFailed') };
    }
    throw error;
  }
}
