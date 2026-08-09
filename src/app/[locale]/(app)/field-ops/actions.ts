'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  createDailyLog,
  createInspection,
  createPunchListItem,
  updateDailyLog,
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
  /** Local draft queued — not server truth. */
  offlineQueued?: boolean;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

/** Present keys may be cleared to null; missing keys stay undefined (no patch). */
function formNullableText(formData: FormData, key: string): string | null | undefined {
  if (!formData.has(key)) return undefined;
  const text = String(formData.get(key) ?? '').trim();
  return text === '' ? null : text;
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

function revalidateFieldOps(projectId?: string) {
  revalidatePath('/field-ops');
  revalidatePath('/field-ops/logs');
  revalidatePath('/field-ops/punch');
  revalidatePath('/field-ops/inspections');
  if (projectId) revalidatePath(`/projects/${projectId}`);
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
    const log = await withOrgContext((context) =>
      createDailyLog(context, {
        projectId,
        workPackageId: formValue(formData, 'workPackageId'),
        logDate: requiredFormValue(formData, 'logDate'),
        weather: formValue(formData, 'weather'),
        summary: requiredFormValue(formData, 'summary'),
        workforceNotes: formValue(formData, 'workforceNotes'),
        blockers: formValue(formData, 'blockers'),
      }),
    );
    revalidateFieldOps(projectId);
    redirect({ href: `/field-ops/logs/${log.id}`, locale });
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updateDailyLogAction(
  _prev: FieldOpsFormState,
  formData: FormData,
): Promise<FieldOpsFormState> {
  try {
    const log = await withOrgContext((context) =>
      updateDailyLog(context, {
        dailyLogId: requiredFormValue(formData, 'dailyLogId'),
        logDate: formValue(formData, 'logDate'),
        weather: formNullableText(formData, 'weather'),
        summary: formValue(formData, 'summary'),
        workforceNotes: formNullableText(formData, 'workforceNotes'),
        blockers: formNullableText(formData, 'blockers'),
        workPackageId: formNullableText(formData, 'workPackageId'),
      }),
    );
    revalidateFieldOps(log.projectId);
    revalidatePath(`/field-ops/logs/${log.id}`);
    return { success: true };
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
    const item = await withOrgContext((context) =>
      createPunchListItem(context, {
        projectId,
        workPackageId: formValue(formData, 'workPackageId'),
        title: requiredFormValue(formData, 'title'),
        description: formValue(formData, 'description'),
        priority: formValue(formData, 'priority') as
          | 'low'
          | 'normal'
          | 'high'
          | 'critical'
          | undefined,
        location: formValue(formData, 'location'),
        dueDate: formValue(formData, 'dueDate'),
      }),
    );
    revalidateFieldOps(projectId);
    redirect({ href: `/field-ops/punch/${item.id}`, locale });
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updatePunchStatusAction(
  _prev: FieldOpsFormState,
  formData: FormData,
): Promise<FieldOpsFormState> {
  try {
    const item = await withOrgContext((context) =>
      updatePunchListItem(context, {
        punchListItemId: requiredFormValue(formData, 'punchListItemId'),
        status: requiredFormValue(formData, 'status') as
          | 'open'
          | 'in_progress'
          | 'done'
          | 'cancelled',
      }),
    );
    revalidateFieldOps(item.projectId);
    revalidatePath(`/field-ops/punch/${item.id}`);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updatePunchPriorityAction(
  _prev: FieldOpsFormState,
  formData: FormData,
): Promise<FieldOpsFormState> {
  try {
    const item = await withOrgContext((context) =>
      updatePunchListItem(context, {
        punchListItemId: requiredFormValue(formData, 'punchListItemId'),
        priority: requiredFormValue(formData, 'priority') as
          | 'low'
          | 'normal'
          | 'high'
          | 'critical',
      }),
    );
    revalidateFieldOps(item.projectId);
    revalidatePath(`/field-ops/punch/${item.id}`);
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
    const inspection = await withOrgContext((context) =>
      createInspection(context, {
        projectId,
        workPackageId: formValue(formData, 'workPackageId'),
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
    revalidateFieldOps(projectId);
    redirect({ href: `/field-ops/inspections/${inspection.id}`, locale });
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updateInspectionStatusAction(
  _prev: FieldOpsFormState,
  formData: FormData,
): Promise<FieldOpsFormState> {
  try {
    const status = requiredFormValue(formData, 'status') as
      | 'scheduled'
      | 'in_progress'
      | 'passed'
      | 'failed'
      | 'cancelled';
    const result = formValue(formData, 'result');
    const inspection = await withOrgContext((context) =>
      updateInspection(context, {
        inspectionId: requiredFormValue(formData, 'inspectionId'),
        status,
        result,
      }),
    );
    revalidateFieldOps(inspection.projectId);
    revalidatePath(`/field-ops/inspections/${inspection.id}`);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}
