'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  createCustomerGrant,
  revokeCustomerGrant,
  CUSTOMER_PORTAL_SCOPES,
  type CustomerPortalScope,
} from '@/modules/portal';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';

export interface PortalActionState {
  ok?: boolean;
  error?: string;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

export async function createCustomerGrantAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const tErrors = await getTranslations('errors');

  const clientId = formValue(formData, 'clientId');
  const projectId = formValue(formData, 'projectId');
  const scopes = formData
    .getAll('scopes')
    .map(String)
    .filter((scope): scope is CustomerPortalScope =>
      (CUSTOMER_PORTAL_SCOPES as readonly string[]).includes(scope),
    );

  try {
    await withOrgContext((context) =>
      createCustomerGrant(context, {
        email: formValue(formData, 'email') ?? '',
        displayName: formValue(formData, 'displayName') ?? null,
        clientId: clientId === 'none' ? null : (clientId ?? null),
        projectId: projectId === 'none' ? null : (projectId ?? null),
        scopes: scopes.length > 0 ? scopes : ['project.summary'],
        expiresAt: formValue(formData, 'expiresAt')
          ? new Date(formValue(formData, 'expiresAt')!).toISOString()
          : null,
      }),
    );
    revalidatePath('/settings/portal');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function revokeCustomerGrantAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const tErrors = await getTranslations('errors');
  const grantId = formValue(formData, 'grantId');
  if (!grantId) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => revokeCustomerGrant(context, { grantId }));
    revalidatePath('/settings/portal');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}
