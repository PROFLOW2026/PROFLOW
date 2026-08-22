import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense, type ReactNode } from 'react';
import { getShellContext } from '@/shared/auth/session';
import { redirect } from '@/shared/i18n/navigation';
import { ConnectivityBanner } from '@/modules/offline/ui/connectivity-banner';
import { OfflineSyncProvider } from '@/modules/offline/ui/offline-sync-provider';
import { NotificationBell } from '@/modules/notifications/ui';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ExperiencePreviewSwitcher } from './experience-preview-switcher';
import { MobileNav } from './mobile-nav';
import { visibleNavItems } from './navigation';
import { QuickCreateDeferred } from './quick-create-deferred';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { UserMenu } from './user-menu';
import { HiddenCapabilityNotice } from './hidden-capability-notice';

/**
 * Authenticated application frame.
 *
 * Navigation and quick-create are derived from the viewer's permissions and
 * the organization's module visibility, so the chrome itself is the first
 * expression of Progressive Complexity rather than a filter applied later.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const [tCommon, shell] = await Promise.all([getTranslations('common'), getShellContext()]);
  if (!shell) redirect({ href: '/onboarding', locale: await getLocale() });

  const workMix = shell.workMix ?? 'projects';
  const items = visibleNavItems(shell.permissions, shell.modules, {
    workMix,
    persona: shell.persona,
    roleSurface: shell.roleSurface,
  });

  const organizationLogoUrl = shell.organizationLogoUrl;

  return (
    <OfflineSyncProvider organizationId={shell.organizationId} userId={shell.user.id}>
      <div className="flex min-h-dvh w-full max-w-full" data-pf-shell="app">
        <Sidebar
          items={items}
          organizationName={shell.organization.name}
          organizationLogoUrl={organizationLogoUrl}
        />

        <div className="relative flex min-w-0 max-w-full flex-1 flex-col">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-100 focus:rounded-md focus:bg-[var(--pf-bg-surface)] focus:px-3 focus:py-2 focus:text-sm focus:outline-2 focus:outline-offset-2 focus:outline-[var(--pf-focus-ring)] focus:shadow-[var(--pf-shadow-md)]"
          >
            {tCommon('a11y.skipToContent')}
          </a>

          <ConnectivityBanner />

          {shell.experiencePreview.allowed ? (
            <ExperiencePreviewSwitcher
              selection={shell.experiencePreview.selection}
              active={shell.experiencePreview.active}
              labelKey={shell.experiencePreview.labelKey}
            />
          ) : null}

          <TopBar
            organizationName={shell.organization.name}
            organizationLogoUrl={organizationLogoUrl}
            notifications={
              shell.permissions.has(PERMISSIONS.NOTIFICATIONS_READ) ? <NotificationBell /> : undefined
            }
            quickCreate={<QuickCreateDeferred shellCore={shell} />}
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
            <div className="mx-auto w-full min-w-0 max-w-6xl">
              <HiddenCapabilityNotice modules={shell.modules} />
              <Suspense fallback={null}>{children}</Suspense>
            </div>
          </main>
        </div>

        <MobileNav items={items} />
      </div>
    </OfflineSyncProvider>
  );
}
