import { EmployeeBottomNav } from '@/modules/employee-app/ui/employee-bottom-nav';
import { EmployeeLogoutButton } from '@/modules/employee-app/ui/employee-logout-button';
import { EmployeeShellHeader } from '@/modules/employee-app/ui/employee-shell-header';
import { getEmployeeShellData } from '@/modules/employee-app/application/get-employee-shell';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { withOrgContext } from '@/shared/auth/session';

export default async function EmployeeShellLayout({ children }: { children: React.ReactNode }) {
  const shell = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    return getEmployeeShellData(context);
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-24 pt-4">
        <EmployeeShellHeader />
        {children}
        <div className="mt-8 pb-2">
          <EmployeeLogoutButton />
        </div>
      </main>
      <EmployeeBottomNav items={shell.nav} />
    </div>
  );
}
