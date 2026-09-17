'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { isLocale, type Locale } from '@/shared/i18n/config';
import { redirect } from '@/shared/i18n/navigation';
import { resolveLocaleAfterAuth } from '@/shared/i18n/persist-locale-preference';
import { getAdminDb } from '@/shared/db/client';
import { getSessionState } from '@/shared/auth/session';
import { createSupabaseServerClient, getSupabaseUser, isSupabaseConfigured } from '@/shared/supabase/server';
import {
  employeeLogin,
  employeeSetPermanentPin,
  findEmployeeAppAccountByUserId,
} from '@/modules/employee-app';
import { isRedirectError } from '@/modules/workforce/application/map-workforce-action-error';
import { DomainRuleError } from '@/shared/errors';

export interface EmployeeAuthFormState {
  error?: string;
}

export async function employeeLoginAction(
  _prev: EmployeeAuthFormState,
  formData: FormData,
): Promise<EmployeeAuthFormState> {
  const t = await getTranslations('employeeApp');
  const urlLocale = await activeLocale();
  const username = String(formData.get('username') ?? '');
  const pin = String(formData.get('pin') ?? '');

  try {
    const result = await employeeLogin({ username, pin });
    const locale = await resolveLocaleAfterAuth((await getSupabaseUser())?.id, urlLocale);
    if (result.pinMustChange) {
      redirect({ href: '/employee/set-pin', locale });
    }
    redirect({ href: '/employee', locale });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof DomainRuleError) {
      const key = error.messageKey?.replace('employeeApp.errors.', '') ?? 'invalidCredentials';
      return { error: t(`errors.${key}`) };
    }
    console.error('[employeeLoginAction] unexpected failure', error);
    return { error: t('errors.notConfigured') };
  }
}

/** Employee App sign-out — redirects to employee login, not Owner sign-in. */
export async function employeeSignOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  revalidatePath('/employee', 'layout');
  redirect({ href: '/employee/login', locale: await activeLocale() });
}

export async function employeeSetPinAction(
  _prev: EmployeeAuthFormState,
  formData: FormData,
): Promise<EmployeeAuthFormState> {
  const t = await getTranslations('employeeApp');
  const urlLocale = await activeLocale();
  const session = await getSessionState();
  if (session.status !== 'authenticated') {
    redirect({ href: '/employee/login', locale: urlLocale });
  }

  let organizationId = session.activeOrganizationId;
  if (!organizationId) {
    const db = getAdminDb();
    for (const membership of session.memberships) {
      const account = await findEmployeeAppAccountByUserId(db, membership.id, session.user.id);
      if (account) {
        organizationId = membership.id;
        break;
      }
    }
  }
  if (!organizationId) {
    redirect({ href: '/employee/login', locale: urlLocale });
  }

  const newPin = String(formData.get('newPin') ?? '');
  const confirmPin = String(formData.get('confirmPin') ?? '');

  try {
    await employeeSetPermanentPin({
      organizationId,
      userId: session.user.id,
      newPin,
      confirmPin,
    });
    const locale = await resolveLocaleAfterAuth(session.user.id, urlLocale);
    redirect({ href: '/employee', locale });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof DomainRuleError) {
      return { error: t('errors.pinInvalid') };
    }
    return { error: t('errors.pinInvalid') };
  }
}

async function activeLocale(): Promise<Locale> {
  const locale = await getLocale();
  return isLocale(locale) ? locale : 'he-IL';
}
