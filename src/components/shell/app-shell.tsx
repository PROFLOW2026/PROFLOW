import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getShellContext } from '@/shared/auth/session';
import { redirect } from '@/shared/i18n/navigation';
import { ConnectivityBanner } from '@/modules/offline/ui/connectivity-banner';
import { OfflineSyncProvider } from '@/modules/offline/ui/offline-sync-provider';
import { NotificationBell } from '@/modules/notifications/ui';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { MobileNav } from './mobile-nav';
import { visibleNavItems } from './navigation';
import { QuickCreate } from './quick-create';
import { buildQuickCreateActions } from './quick-create-actions';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { UserMenu } from './user-menu';

/**
 * Authenticated application frame.
 *
 * Navigation and quick-create are derived from the viewer's permissions and
 * the organization's module visibility, so the chrome itself is the first
 * expression of Progressive Complexity rather than a filter applied later.
 *
 * Installed-app first paint is dominated by SW navigation preload and the `/`
 * rewrite - not by splitting this chrome across Suspense (that duplicated
 * Radix/client trees on hydrate).
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const tCommon = await getTranslations('common');

  const shell = await getShellContext();
  if (!shell) redirect({ href: '/onboarding', locale: await getLocale() });

  const workMix = shell.workMix ?? 'projects';
  const items = visibleNavItems(shell.permissions, shell.modules, { workMix });
  const quickCreateActions = buildQuickCreateActions(
    shell.permissions,
    shell.modules,
    workMix,
    shell.quickCreateEmphasis,
    shell.suggestedDefaults,
  );

  return (
    <OfflineSyncProvider organizationId={shell.organizationId} userId={shell.user.id}>
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
            notifications={
              shell.permissions.has(PERMISSIONS.NOTIFICATIONS_READ) ? <NotificationBell /> : undefined
            }
            quickCreate={<QuickCreate actions={quickCreateActions} />}
            userMenu={
              <UserMenu
                displayName={shell.user.displayName}
                email={shell.user.email}
                organizationName={shell.organization.name}
                organizations={shell.memberships.map((membership) => ({
                  id: membership.id,
                  name: membership.name,
                }))}
                activeOrganizationId={shell.organizationId}
              />
            }
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
