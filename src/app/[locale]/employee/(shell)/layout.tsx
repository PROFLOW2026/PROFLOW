import { getLocale, getTranslations } from 'next-intl/server';
import { EmployeeQuickCreate } from '@/components/shell/employee-quick-create';
import { buildEmployeeOrgQuickCreateActions } from '@/components/shell/employee-quick-create-actions';
import { EmployeeBottomNav } from '@/modules/employee-app/ui/employee-bottom-nav';
import { EmployeeSideNav } from '@/modules/employee-app/ui/employee-side-nav';
import { EmployeeShellHeader } from '@/modules/employee-app/ui/employee-shell-header';
import { EmployeeTopBar } from '@/modules/employee-app/ui/employee-top-bar';
import { getEmployeeShellData } from '@/modules/employee-app/application/get-employee-shell';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { getSessionState, withOrgContext } from '@/shared/auth/session';
import { redirect } from '@/shared/i18n/navigation';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

/**
 * Employee shell scroll model:
 * - Document/body is the single scroll root for normal list/form pages.
 * - Do NOT put overflow-y-auto on <main> inside an h-svh overflow-hidden frame
 *   (that caused nested scroll on /employee/projects).
 * - Side nav may scroll independently when the nav list is long.
 * - Kanban/viewer regions opt into local scroll via employeeBoardScrollRegionClass.
 */
export default async function EmployeeShellLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const tCommon = await getTranslations('common');
  const session = await getSessionState();
  if (session.status !== 'authenticated') {
    redirect({ href: '/employee/login', locale });
  }

  const { shell, quickCreateActions } = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    return {
      shell: await getEmployeeShellData(context),
      quickCreateActions: buildEmployeeOrgQuickCreateActions(context.permissions),
    };
  });

  return (
    <WithAppClientMessages>
      <div className="flex min-h-svh bg-[var(--pf-bg-page)]" data-pf-employee-app>
        <EmployeeSideNav items={shell.nav} organizationName={shell.organizationName} />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <a
            href="#main"
            className="absolute start-2 -top-[100vh] z-critical h-px w-px overflow-hidden border-0 p-0 whitespace-nowrap opacity-0 focus:top-2 focus:h-auto focus:w-auto focus:overflow-visible focus:opacity-100 focus:rounded-md focus:bg-[var(--pf-bg-surface)] focus:px-3 focus:py-2 focus:text-sm focus:shadow-[var(--pf-shadow-md)]"
          >
            {tCommon('a11y.skipToContent')}
          </a>
          <EmployeeTopBar
            employeeName={shell.employeeName}
            email={session.user.email}
            organizationName={shell.organizationName}
          />
          <main
            id="main"
            className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-[var(--pf-mobile-content-bottom)] md:max-w-6xl md:px-6 lg:pb-8"
          >
            <EmployeeShellHeader />
            {children}
          </main>
          <EmployeeBottomNav items={shell.nav} />
        </div>
        <EmployeeQuickCreate actions={quickCreateActions} />
      </div>
    </WithAppClientMessages>
  );
}
