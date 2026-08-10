import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getShellContext } from '@/shared/auth/session';
import { redirect } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ConnectivityBanner } from '@/modules/offline/ui/connectivity-banner';
import { OfflineSyncProvider } from '@/modules/offline/ui/offline-sync-provider';
import type { WorkMix } from '@/modules/tenancy';
import { workMixSurfacesJobs } from '@/modules/tenancy';
import { MobileNav } from './mobile-nav';
import { visibleNavItems } from './navigation';
import { QuickCreate, type QuickCreateAction } from './quick-create';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { UserMenu } from './user-menu';

/**
 * Authenticated application frame.
 *
 * Navigation and quick-create are derived from the viewer's permissions and
 * the organization's module visibility, so the chrome itself is the first
 * expression of Progressive Complexity rather than a filter applied later.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const tCommon = await getTranslations('common');

  const shell = await getShellContext();
  if (!shell) redirect({ href: '/onboarding', locale: await getLocale() });

  const workMix = shell.workMix ?? 'projects';
  const items = visibleNavItems(shell.permissions, shell.modules, { workMix });
  const quickCreateActions = buildQuickCreateActions(shell.permissions, shell.modules, workMix);

  const userMenu = <UserMenuSlot organizationName={shell.organization.name} />;

  return (
    <OfflineSyncProvider organizationId={shell.organizationId}>
      <div className="flex min-h-dvh w-full max-w-full" data-pf-shell="app">
        <Sidebar items={items} organizationName={shell.organization.name} />

        <div className="relative flex min-w-0 max-w-full flex-1 flex-col">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-100 focus:rounded-md focus:bg-[var(--pf-bg-surface)] focus:px-3 focus:py-2 focus:text-sm focus:outline-2 focus:outline-offset-2 focus:outline-[var(--pf-focus-ring)] focus:shadow-[var(--pf-shadow-md)]"
          >
            {tCommon('a11y.skipToContent')}
          </a>

          <ConnectivityBanner />

          <TopBar
            organizationName={shell.organization.name}
            quickCreate={<QuickCreate actions={quickCreateActions} />}
            userMenu={userMenu}
          />

          <main
            id="main"
            className="min-w-0 w-full flex-1 px-4 pt-5 pb-[var(--pf-mobile-content-bottom)] sm:px-6 lg:pb-8"
          >
            <div className="mx-auto w-full min-w-0 max-w-6xl">{children}</div>
          </main>
        </div>

        <MobileNav items={items} />
      </div>
    </OfflineSyncProvider>
  );
}

async function UserMenuSlot({ organizationName }: { organizationName: string }) {
  const context = await getShellContext();
  if (!context) return null;

  return (
    <UserMenu
      displayName={context.user.displayName}
      email={context.user.email}
      organizationName={organizationName}
      organizations={context.memberships.map((membership) => ({
        id: membership.id,
        name: membership.name,
      }))}
      activeOrganizationId={context.organizationId}
    />
  );
}

function buildQuickCreateActions(
  permissions: ReadonlySet<string>,
  modules: Record<string, boolean>,
  workMix: WorkMix,
): QuickCreateAction[] {
  const actions: QuickCreateAction[] = [];
  const canCreateWork = permissions.has(PERMISSIONS.PROJECTS_CREATE);
  const jobsVisible = Boolean(modules.jobs) || workMixSurfacesJobs(workMix);

  if (canCreateWork) {
    const jobAction = { key: 'job', href: '/jobs/new', labelKey: 'job' } as const;
    const projectAction = { key: 'project', href: '/projects/new', labelKey: 'project' } as const;
    if (workMix === 'jobs') {
      if (jobsVisible) actions.push(jobAction);
      actions.push(projectAction);
    } else if (workMix === 'mixed') {
      if (jobsVisible) actions.push(jobAction);
      actions.push(projectAction);
    } else {
      actions.push(projectAction);
      if (jobsVisible) actions.push(jobAction);
    }
  }

  if (permissions.has(PERMISSIONS.EXPENSES_CREATE)) {
    actions.push({ key: 'expense', href: '/expenses/new', labelKey: 'expense' });
  }
  if (modules.changes && permissions.has(PERMISSIONS.CHANGES_MANAGE)) {
    actions.push({ key: 'change', href: '/changes/new', labelKey: 'change' });
  }
  if (modules.billing && permissions.has(PERMISSIONS.BILLING_MANAGE)) {
    actions.push({ key: 'billingRecord', href: '/billing/new', labelKey: 'billingRecord' });
    actions.push({ key: 'payment', href: '/billing/payments/new', labelKey: 'payment' });
  }
  if (modules.clients && permissions.has(PERMISSIONS.CLIENTS_MANAGE)) {
    actions.push({ key: 'client', href: '/clients/new', labelKey: 'client' });
  }
  if (modules.vendors && permissions.has(PERMISSIONS.VENDORS_MANAGE)) {
    actions.push({ key: 'vendor', href: '/vendors/new', labelKey: 'vendor' });
  }
  if (modules.workforce && permissions.has(PERMISSIONS.WORKFORCE_MANAGE)) {
    actions.push({ key: 'employee', href: '/workforce/employees/new', labelKey: 'employee' });
  }
  if (modules.workforce && permissions.has(PERMISSIONS.TIME_MANAGE)) {
    actions.push({ key: 'timeEntry', href: '/workforce/time/new', labelKey: 'timeEntry' });
  }

  return actions;
}
