'use server';

import { refresh } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  createInvitation,
  revokeConnectionInvitation,
} from '@/modules/connected-projects';
import {
  createInvitationSchema,
  formToObject,
  revokeInvitationSchema,
} from '@/modules/connected-projects/validation/schemas';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';
import type { DeveloperConnectionActionState } from '@/modules/connected-projects/ui/developer-connection-panel';

async function mapError(error: unknown, t: Awaited<ReturnType<typeof getTranslations>>): Promise<string> {
  if (error instanceof AppError) {
    const key = error.messageKey.startsWith('connectedProjects.errors.')
      ? error.messageKey.slice('connectedProjects.errors.'.length)
      : error.code === 'authorization_denied'
        ? 'forbidden'
        : 'generic';
    return t(`errors.${key}`);
  }
  console.error('[connected-projects] developer action failed', error);
  return t('errors.generic');
}

export async function issueConnectionCodeAction(
  _prev: DeveloperConnectionActionState,
  formData: FormData,
): Promise<DeveloperConnectionActionState> {
  const t = await getTranslations('connectedProjects');
  const parsed = createInvitationSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { error: t('errors.validation') };

  try {
    const result = await withOrgContext((context) => createInvitation(context, parsed.data));
    refresh();
    return {
      success: t('developer.codeResultTitle'),
      code: result.code,
      expiresAt: result.expiresAt.toISOString(),
    };
  } catch (error) {
    return { error: await mapError(error, t) };
  }
}

export async function revokeConnectionCodeAction(
  _prev: DeveloperConnectionActionState,
  formData: FormData,
): Promise<DeveloperConnectionActionState> {
  const t = await getTranslations('connectedProjects');
  const parsed = revokeInvitationSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { error: t('errors.validation') };

  try {
    await withOrgContext((context) =>
      revokeConnectionInvitation(context, {
        projectId: parsed.data.projectId,
        invitationId: parsed.data.invitationId,
      }),
    );
    refresh();
    return { success: t('developer.revoke') };
  } catch (error) {
    return { error: await mapError(error, t) };
  }
}
