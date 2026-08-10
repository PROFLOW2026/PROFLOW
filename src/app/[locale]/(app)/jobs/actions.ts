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
  DomainRuleError,
  ValidationError,
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
  const tValidation = await getTranslations('validation');
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (!issue.path) continue;
    const message =
      issue.message === DATE_ORDER_MESSAGE || issue.message === 'validation.endBeforeStart'
        ? tValidation('endBeforeStart')
        : issue.message;
    fieldErrors[issue.path] = message;
  }
  return { error: error.message, fieldErrors };
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
        workersNote: formValue(formData, 'workersNote'),
      }),
    );

    revalidatePath('/jobs');
    revalidatePath('/projects');
    redirect({ href: `/jobs/${result.projectId}`, locale });
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
  const tErrors = await getTranslations('errors');
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
    if (error instanceof ValidationError) return await mapValidationError(error);
    if (error instanceof DomainRuleError) return { error: error.message };
    if (error instanceof AuthorizationError) return { error: tErrors('notAllowed') };
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function convertJobToProjectAction(
  _prev: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const tErrors = await getTranslations('errors');
  const tJobs = await getTranslations('jobs');
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
    if (error instanceof DomainRuleError) {
      return {
        error:
          error.messageKey === 'jobs.convert.notAJob'
            ? tJobs('convert.notAJob')
            : error.messageKey === 'jobs.convert.requiresRevenueBasis'
              ? tJobs('convert.requiresRevenueBasis')
              : error.message,
      };
    }
    if (error instanceof ValidationError) return await mapValidationError(error);
    if (error instanceof AuthorizationError) return { error: tErrors('notAllowed') };
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }

  return {};
}
