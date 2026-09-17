import 'server-only';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';
import type { OrgContext } from '@/shared/auth/context';
import { getSessionState, runInOrgContext } from '@/shared/auth/session';
import { findEmployeeAppAccountByUserId } from '../data/accounts.repository';
import { isActiveEmployeeAppAccount, isEmployeeAppUser } from './load-employee-app-context';

export async function requireEmployeeAppSession(): Promise<{
  userId: string;
  organizationId: string;
}> {
  const session = await getSessionState();
  const locale = await getLocale();

  if (session.status !== 'authenticated' || !session.activeOrganizationId) {
    redirect({ href: '/employee/login', locale });
  }

  const account = await runInOrgContext(
    session.user.id,
    session.activeOrganizationId!,
    async (context) =>
      findEmployeeAppAccountByUserId(
        context.db,
        context.organizationId,
        context.userId,
      ),
  );

  if (!account || !isActiveEmployeeAppAccount(account)) {
    redirect({ href: '/employee/login', locale });
  }

  if (account.pinMustChange) {
    redirect({ href: '/employee/set-pin', locale });
  }

  return { userId: session.user.id, organizationId: session.activeOrganizationId! };
}

export async function assertEmployeeAppContext(context: OrgContext): Promise<void> {
  const locale = context.locale;
  if (!context.roleKeys.includes('employee') || !context.employeeApp) {
    redirect({ href: '/', locale });
  }
  if (!isActiveEmployeeAppAccount(context.employeeApp.account)) {
    redirect({ href: '/employee/login', locale });
  }
  if (context.employeeApp.account.pinMustChange) {
    redirect({ href: '/employee/set-pin', locale });
  }
}

/**
 * Owner product surfaces (AppShell, dashboard, settings, etc.) are forbidden for
 * active Employee App sessions. Grants control employee routes only.
 */
export function assertOwnerAppSurface(context: OrgContext): void {
  if (!isEmployeeAppUser(context)) return;

  const locale = context.locale;
  const account = context.employeeApp!.account;

  if (!isActiveEmployeeAppAccount(account)) {
    redirect({ href: '/employee/login', locale });
  }
  if (account.pinMustChange) {
    redirect({ href: '/employee/set-pin', locale });
  }
  redirect({ href: '/employee', locale });
}
