import { getLocale } from 'next-intl/server';
import { EmployeeBottomNav } from '@/modules/employee-app/ui/employee-bottom-nav';
import { EmployeeShellHeader } from '@/modules/employee-app/ui/employee-shell-header';
import { EmployeeTopBar } from '@/modules/employee-app/ui/employee-top-bar';
import { getEmployeeShellData } from '@/modules/employee-app/application/get-employee-shell';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { getSessionState, withOrgContext } from '@/shared/auth/session';
import { redirect } from '@/shared/i18n/navigation';

export default async function EmployeeShellLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const session = await getSessionState();
  if (session.status !== 'authenticated') {
    redirect({ href: '/employee/login', locale });
  }

  const shell = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    return getEmployeeShellData(context);
  });

  return (
    <div className="flex h-svh flex-col overflow-hidden" data-pf-employee-app>
      <EmployeeTopBar
        employeeName={shell.employeeName}
        email={session.user.email}
        organizationName={shell.organizationName}
      />
      <main className="mx-auto min-h-0 w-full max-w-lg flex-1 overflow-y-auto px-4 pt-4 pb-[var(--pf-employee-main-bottom)]">
        <EmployeeShellHeader />
        {children}
      </main>
      <EmployeeBottomNav items={shell.nav} />
    </div>
  );
}
