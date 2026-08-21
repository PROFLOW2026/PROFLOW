'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  grantProjectAccess,
  revokeProjectAccess,
  saveProjectAccessMode,
} from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, AuthorizationError, ValidationError } from '@/shared/errors';
import type { SettingsActionState } from '../actions';

async function mapError(error: unknown): Promise<SettingsActionState> {
  const t = await getTranslations('errors');
  if (error instanceof ValidationError) return { error: error.message };
  if (error instanceof AuthorizationError) return { error: t('notAllowed') };
  if (error instanceof AppError) return { error: error.message };
  throw error;
}

export async function saveProjectAccessModeAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    await withOrgContext((context) => saveProjectAccessMode(context, formData.get('mode')));
    revalidatePath('/settings/people');
    revalidatePath('/projects');
    return { ok: true };
  } catch (error) {
    return await mapError(error);
  }
}

export async function grantProjectAccessAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    await withOrgContext((context) =>
      grantProjectAccess(context, {
        userId: String(formData.get('userId') ?? ''),
        projectId: String(formData.get('projectId') ?? ''),
        accessLevel: String(formData.get('accessLevel') ?? 'read'),
      }),
    );
    revalidatePath('/settings/people');
    revalidatePath('/projects');
    return { ok: true };
  } catch (error) {
    return await mapError(error);
  }
}

export async function revokeProjectAccessAction(grantId: string): Promise<SettingsActionState> {
  try {
    await withOrgContext((context) => revokeProjectAccess(context, grantId));
    revalidatePath('/settings/people');
    revalidatePath('/projects');
    return { ok: true };
  } catch (error) {
    return await mapError(error);
  }
}
