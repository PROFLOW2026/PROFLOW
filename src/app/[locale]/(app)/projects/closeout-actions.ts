'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  closeProject,
  markCloseoutReady,
  reopenProject,
  startCloseout,
} from '@/modules/closeout';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError, ValidationError } from '@/shared/errors';

export interface CloseoutFormState {
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

async function mapError(error: unknown): Promise<CloseoutFormState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('closeout');
  if (error instanceof ValidationError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      if (issue.path) fieldErrors[issue.path] = issue.message;
    }
    return { error: error.message, fieldErrors };
  }
  if (error instanceof DomainRuleError) {
    const key = error.messageKey.replace(/^closeout\./, '');
    try {
      return { error: t(key as 'errors.notCloseable') };
    } catch {
      return { error: error.message };
    }
  }
  if (error instanceof AppError) return { error: tErrors('unexpected') };
  throw error;
}

function revalidateCloseout(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
}

export async function startCloseoutAction(
  _prev: CloseoutFormState,
  formData: FormData,
): Promise<CloseoutFormState> {
  const projectId = requiredFormValue(formData, 'projectId');
  try {
    await withOrgContext((context) => startCloseout(context, { projectId }));
    revalidateCloseout(projectId);
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function markCloseoutReadyAction(
  _prev: CloseoutFormState,
  formData: FormData,
): Promise<CloseoutFormState> {
  const projectId = requiredFormValue(formData, 'projectId');
  try {
    await withOrgContext((context) => markCloseoutReady(context, { projectId }));
    revalidateCloseout(projectId);
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function closeProjectAction(
  _prev: CloseoutFormState,
  formData: FormData,
): Promise<CloseoutFormState> {
  const projectId = requiredFormValue(formData, 'projectId');
  try {
    await withOrgContext((context) =>
      closeProject(context, { projectId, reason: requiredFormValue(formData, 'reason') }),
    );
    revalidateCloseout(projectId);
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function reopenProjectAction(
  _prev: CloseoutFormState,
  formData: FormData,
): Promise<CloseoutFormState> {
  const projectId = requiredFormValue(formData, 'projectId');
  try {
    await withOrgContext((context) =>
      reopenProject(context, { projectId, reason: requiredFormValue(formData, 'reason') }),
    );
    revalidateCloseout(projectId);
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}
