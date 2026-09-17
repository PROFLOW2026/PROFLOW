'use server';

import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';
import { getAdminDb } from '@/shared/db/client';
import { getSessionState } from '@/shared/auth/session';
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
  const locale = await getLocale();
  const username = String(formData.get('username') ?? '');
  const pin = String(formData.get('pin') ?? '');

  try {
    const result = await employeeLogin({ username, pin });
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

export async function employeeSetPinAction(
  _prev: EmployeeAuthFormState,
  formData: FormData,
): Promise<EmployeeAuthFormState> {
  const t = await getTranslations('employeeApp');
  const locale = await getLocale();
  const session = await getSessionState();
  if (session.status !== 'authenticated') {
    redirect({ href: '/employee/login', locale });
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
    redirect({ href: '/employee/login', locale });
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
    redirect({ href: '/employee', locale });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof DomainRuleError) {
      return { error: t('errors.pinInvalid') };
    }
    return { error: t('errors.pinInvalid') };
  }
}
