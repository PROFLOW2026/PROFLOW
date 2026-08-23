'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  convertJobToProject,
  createJob,
  DATE_ORDER_MESSAGE,
  setJobFixedPrice,
} from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import {
  AppError,
  AuthorizationError,
  ValidationError,
  mapServerActionError,
} from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface JobFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  return String(value);
}

function requiredFormValue(formData: FormData, key: string): string {
  return formValue(formData, key) ?? '';
}

async function mapValidationError(error: ValidationError): Promise<JobFormState> {
  const tErrors = await getTranslations('errors');
  const tValidation = await getTranslations('validation');
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'validationFailed'),
    fieldMessageOverrides: {
      [DATE_ORDER_MESSAGE]: tValidation('endBeforeStart'),
    },
  });
}

async function mapJobAppError(error: unknown): Promise<JobFormState> {
  const tErrors = await getTranslations('errors');
  const tJobs = await getTranslations('jobs');
  if (error instanceof ValidationError) return mapValidationError(error);
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: {
      jobs: (key) => tJobs(key as 'convert.notAJob'),
    },
  });
}

export async function createJobAction(
  _prev: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  const clientMode = String(formData.get('clientMode') ?? 'new');
  let clientId: string | null = null;
  let clientName: string | null = null;

  if (clientMode === 'existing') {
    const raw = formData.get('clientId');
    clientId = raw ? String(raw) : null;
  } else {
    clientName = String(formData.get('clientName') ?? '').trim() || null;
  }

  const employeeIds = formData
    .getAll('employeeIds')
    .flatMap((value) => (typeof value === 'string' && value.trim() ? [value.trim()] : []));

  try {
    const result = await withOrgContext((context) =>
      createJob(context, {
        name: requiredFormValue(formData, 'name'),
        description: formValue(formData, 'description'),
        clientId,
        clientName,
        pricingMode: requiredFormValue(formData, 'pricingMode') as 'fixed' | 'open',
        priceAmount: formValue(formData, 'contractValueAmount') ?? formValue(formData, 'priceAmount'),
        priceCurrency: formValue(formData, 'contractValueCurrency') ?? formValue(formData, 'priceCurrency'),
        amountIncludesTax: formValue(formData, 'amountIncludesTax'),
        startDate: requiredFormValue(formData, 'startDate'),
        targetEndDate: formValue(formData, 'targetEndDate'),
        notes: formValue(formData, 'notes'),
        employeeIds,
      }),
    );

    revalidatePath('/jobs');
    revalidatePath('/projects');
    revalidatePath(`/jobs/${result.projectId}`);
    if (employeeIds.length > 0) {
      revalidatePath('/workforce', 'layout');
    }
    const href =
      employeeIds.length > 0 ? `/jobs/${result.projectId}?tab=team` : `/jobs/${result.projectId}`;
    redirect({ href, locale });
  } catch (error) {
    if (error instanceof ValidationError) return await mapValidationError(error);
    if (error instanceof AuthorizationError) return { error: tErrors('notAllowed') };
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }

  return {};
}

export async function setJobFixedPriceAction(
  _prev: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const jobId = requiredFormValue(formData, 'jobId');

  try {
    await withOrgContext((context) =>
      setJobFixedPrice(context, {
        jobId,
        priceAmount: requiredFormValue(formData, 'contractValueAmount'),
        priceCurrency: formValue(formData, 'contractValueCurrency'),
        amountIncludesTax: formValue(formData, 'amountIncludesTax'),
      }),
    );

    revalidatePath(`/jobs/${jobId}`);
    revalidatePath('/jobs');
    return { success: true };
  } catch (error) {
    return mapJobAppError(error);
  }
}

export async function convertJobToProjectAction(
  _prev: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const locale = await getLocale();
  const jobId = requiredFormValue(formData, 'jobId');

  try {
    await withOrgContext((context) => convertJobToProject(context, { jobId }));

    revalidatePath(`/jobs/${jobId}`);
    revalidatePath('/jobs');
    revalidatePath('/projects');
    revalidatePath(`/projects/${jobId}`);
    redirect({ href: `/projects/${jobId}`, locale });
  } catch (error) {
    return mapJobAppError(error);
  }

  return {};
}
