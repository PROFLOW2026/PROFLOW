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
import { mapServerActionError } from '@/shared/errors';

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
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: {
      closeout: (key) => t(key as 'errors.notCloseable'),
    },
  });
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
