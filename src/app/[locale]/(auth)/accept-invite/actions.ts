'use server';

import { getLocale, getTranslations } from 'next-intl/server';
import { acceptInvitation } from '@/modules/tenancy';
import { getSessionState, setActiveOrganization } from '@/shared/auth/session';
import { getAdminDb } from '@/shared/db/client';
import { AppError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface AcceptInviteState {
  error?: string;
}

/**
 * Redeeming runs before the accepting user belongs to the organization, so it
 * uses the admin handle: row-level security would otherwise hide the very
 * invitation being claimed. Supabase Auth has already established who this is,
 * and `acceptInvitation` re-checks that the token matches their email.
 */
export async function acceptInviteAction(
  _prevState: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const t = await getTranslations('errors');
  const locale = await getLocale();

  const token = String(formData.get('token') ?? '');
  if (!token) return { error: t('notFound') };

  const session = await getSessionState();
  if (session.status !== 'authenticated') {
    redirect({ href: '/sign-in', locale });
  }

  let organizationId: string;
  try {
    const result = await acceptInvitation(getAdminDb(), {
      token,
      userId: session.user.id,
      userEmail: session.user.email,
    });
    organizationId = result.organizationId;
  } catch (error) {
    if (error instanceof AppError) {
      return { error: error.messageKey ? t(error.messageKey.replace(/^errors\./, '')) : t('unexpected') };
    }
    throw error;
  }

  // Land in the organization they just joined rather than whichever one they
  // happened to have open.
  await setActiveOrganization(organizationId);
  redirect({ href: '/', locale });
}
