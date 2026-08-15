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
  try {
    await withOrgContext((context) =>
      updateContract(context, {
        contractId: String(formData.get('contractId') ?? ''),
        name: formValue(formData, 'name'),
        contractNumber: formValue(formData, 'contractNumber'),
        startDate: formValue(formData, 'startDate'),
        endDate: formValue(formData, 'endDate'),
        retentionPercent: formValue(formData, 'retentionPercent'),
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: t('errors.saveFailed') };
    throw error;
  }
}
