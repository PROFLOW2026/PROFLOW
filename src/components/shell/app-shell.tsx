import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getShellContext } from '@/shared/auth/session';
import { redirect } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ConnectivityBanner } from '@/modules/offline/ui/connectivity-banner';
import { OfflineSyncProvider } from '@/modules/offline/ui/offline-sync-provider';
import { ServiceWorkerRegistrar } from '@/modules/offline/ui/service-worker-registrar';
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

  const items = visibleNavItems(shell.permissions, shell.modules);
  const quickCreateActions = buildQuickCreateActions(shell.permissions, shell.modules);

  const userMenu = <UserMenuSlot organizationName={shell.organization.name} />;

  return (
    <OfflineSyncProvider organizationId={shell.organizationId}>
      <div className="flex min-h-dvh" data-pf-shell="app">
        <ServiceWorkerRegistrar />
        <Sidebar items={items} organizationName={shell.organization.name} />

        <div className="relative flex min-w-0 flex-1 flex-col">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-100 focus:rounded-md focus:bg-[var(--pf-bg-surface)] focus:px-3 focus:py-2 focus:text-sm"
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
            className="flex-1 px-4 pt-5 pb-[calc(var(--pf-bottomnav-height)+1.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:pb-8"
          >
            <div className="mx-auto w-full max-w-6xl">{children}</div>
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
): QuickCreateAction[] {
  const actions: QuickCreateAction[] = [];

  if (permissions.has(PERMISSIONS.PROJECTS_CREATE)) {
    actions.push({ key: 'project', href: '/projects/new', labelKey: 'project' });
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
  if (modules.workforce && permissions.has(PERMISSIONS.TIME_MANAGE)) {
    actions.push({ key: 'timeEntry', href: '/workforce/time/new', labelKey: 'timeEntry' });
  }

  return actions;
}
