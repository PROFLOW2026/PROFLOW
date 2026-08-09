'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  createDailyLog,
  createInspection,
  createPunchListItem,
  updateInspection,
  updatePunchListItem,
} from '@/modules/field-ops';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError, ValidationError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface FieldOpsFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function requiredFormValue(formData: FormData, key: string): string {
  return formValue(formData, key) ?? '';
}

function mapValidationError(error: ValidationError): FieldOpsFormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.path) fieldErrors[issue.path] = issue.message;
  }
  return { error: error.message, fieldErrors };
}

async function mapAppError(error: unknown): Promise<FieldOpsFormState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('fieldOps');
  if (error instanceof ValidationError) return mapValidationError(error);
  if (error instanceof DomainRuleError) {
    const key = error.messageKey.replace(/^fieldOps\./, '');
    try {
      return { error: t(key as 'errors.invalidPunchTransition') };
    } catch {
      return { error: error.message };
    }
  }
  if (error instanceof AppError) return { error: tErrors('unexpected') };
  throw error;
}

export async function createDailyLogAction(
  _prev: FieldOpsFormState,
  formData: FormData,
): Promise<FieldOpsFormState> {
  const locale = await getLocale();
  const t = await getTranslations('fieldOps');
  const projectId = formValue(formData, 'projectId');
  if (!projectId) return { error: t('errors.projectRequired') };

  try {
    await withOrgContext((context) =>
      createDailyLog(context, {
        projectId,
        logDate: requiredFormValue(formData, 'logDate'),
        weather: formValue(formData, 'weather'),
        summary: requiredFormValue(formData, 'summary'),
        workforceNotes: formValue(formData, 'workforceNotes'),
      }),
    );
    revalidatePath('/field-ops');
    revalidatePath('/field-ops/logs');
    redirect({ href: '/field-ops/logs', locale });
  } catch (error) {
    return mapAppError(error);
  }
}

export async function createPunchListItemAction(
  _prev: FieldOpsFormState,
  formData: FormData,
): Promise<FieldOpsFormState> {
  const locale = await getLocale();
  const t = await getTranslations('fieldOps');
  const projectId = formValue(formData, 'projectId');
  if (!projectId) return { error: t('errors.projectRequired') };

  try {
    await withOrgContext((context) =>
      createPunchListItem(context, {
        projectId,
        title: requiredFormValue(formData, 'title'),
        description: formValue(formData, 'description'),
        priority: formValue(formData, 'priority') as 'low' | 'normal' | 'high' | 'critical' | undefined,
        location: formValue(formData, 'location'),
        dueDate: formValue(formData, 'dueDate'),
      }),
    );
    revalidatePath('/field-ops');
    revalidatePath('/field-ops/punch');
    redirect({ href: '/field-ops/punch', locale });
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updatePunchStatusAction(
  _prev: FieldOpsFormState,
  formData: FormData,
): Promise<FieldOpsFormState> {
  try {
    await withOrgContext((context) =>
      updatePunchListItem(context, {
        punchListItemId: requiredFormValue(formData, 'punchListItemId'),
        status: requiredFormValue(formData, 'status') as 'open' | 'in_progress' | 'done' | 'cancelled',
      }),
    );
    revalidatePath('/field-ops/punch');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function createInspectionAction(
  _prev: FieldOpsFormState,
  formData: FormData,
): Promise<FieldOpsFormState> {
  const locale = await getLocale();
  const t = await getTranslations('fieldOps');
  const projectId = formValue(formData, 'projectId');
  if (!projectId) return { error: t('errors.projectRequired') };

  try {
    await withOrgContext((context) =>
      createInspection(context, {
        projectId,
        title: requiredFormValue(formData, 'title'),
        kind: formValue(formData, 'kind') as
          | 'general'
          | 'safety'
          | 'quality'
          | 'handover'
          | 'other'
          | undefined,
        scheduledOn: formValue(formData, 'scheduledOn'),
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath('/field-ops');
    revalidatePath('/field-ops/inspections');
    redirect({ href: '/field-ops/inspections', locale });
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updateInspectionStatusAction(
  _prev: FieldOpsFormState,
  formData: FormData,
): Promise<FieldOpsFormState> {
  try {
    await withOrgContext((context) =>
      updateInspection(context, {
        inspectionId: requiredFormValue(formData, 'inspectionId'),
        status: requiredFormValue(formData, 'status') as
          | 'scheduled'
          | 'in_progress'
          | 'passed'
          | 'failed'
          | 'cancelled',
      }),
    );
    revalidatePath('/field-ops/inspections');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}
