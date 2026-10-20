'use client';

import { Bell, Building2, Check, ChevronsUpDown, HardHat, LogOut, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { pressableChromeClassName, pressableClassName } from '@/components/ui/pressable';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { writeClientLocaleCookie } from '@/shared/i18n/auth-locale';
import { LOCALES, LOCALE_METADATA, type Locale } from '@/shared/i18n/config';
import { Link, usePathname, useRouter } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { ThemeHeaderToggle, ThemeMenuSection } from '@/components/shell/theme-switcher';
import { clearThemeClientState } from '@/shared/theme/theme-provider';
import { resetThemeCookieForSignOutAction } from '@/shared/theme/persist-theme-preference';
import {
  contractorPortalSignOutAction,
  persistExternalPrincipalLocaleAction,
} from '../application/actions';
import type { PortalShellData, PortalShellProject } from '../application/load-portal-session';
import {
  activeContractorMobileTab,
  contractorMobileTabIconKey,
  isContractorFinanceRouteKey,
  isContractorWorkRouteKey,
} from '../domain/mobile-tabs';
import {
  activePortalNavKey,
  buildPortalMobileNav,
  projectIdFromPortalPath,
  type PortalNavItem,
} from '../domain/nav';
import { ContractorBottomNav } from './contractor-bottom-nav';
import { portalOrganizationLabel, portalProjectLabel } from './labels';
import { PortalNavIcon } from './portal-nav-icon';
import {
  isPortalPlanViewerPath,
  portalSectionLabelClass,
  portalShellColumnClass,
  portalShellFrameClass,
  portalShellMainClass,
  portalShellMainPlanViewerClass,
  portalSideNavClass,
  portalSideNavLinkClass,
  portalSideNavRailClass,
  portalTopBarClass,
} from './portal-surface';

type Translate = ReturnType<typeof useTranslations>;

/**
 * Contractor shell scroll model (same as employee):
 * - Document/body is the single scroll root for normal list/form pages.
 * - Do NOT put overflow-y-auto on <main> inside an h-svh overflow-hidden frame.
 * - Side nav may scroll independently when the nav list is long.
 */
function useActiveProject(projects: readonly PortalShellProject[]): PortalShellProject | null {
  const pathname = usePathname();
  const projectId = projectIdFromPortalPath(pathname);
  return projectId ? (projects.find((project) => project.projectId === projectId) ?? null) : null;
}

function companyLabel(t: Translate, projects: readonly PortalShellProject[], active: PortalShellProject | null) {
  const source = active ? [active] : projects;
  const vendors = [...new Set(source.flatMap((project) => project.vendorNames))];
  const organizations = [...new Set(source.map((project) => project.organizationName ?? project.organizationId))];
  return {
    vendor: vendors.length > 0 ? vendors.join(', ') : null,
    organization:
      organizations.length === 1
        ? portalOrganizationLabel(t, source[0]!.organizationName)
        : organizations.length > 1
          ? t('shell.multipleOrganizations', { count: organizations.length })
          : null,
  };
}

function SideNavLink({ item, active, t }: { item: PortalNavItem; active: boolean; t: Translate }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={portalSideNavLinkClass(active)}
    >
      <span className={portalSideNavRailClass(active)} aria-hidden />
      <PortalNavIcon
        navKey={item.key}
        className={cn('size-4 shrink-0', active ? 'text-[var(--pf-accent)]' : 'text-[var(--pf-text-muted)]')}
      />
      <span className="min-w-0 truncate">{t(item.labelKey)}</span>
    </Link>
  );
}

function ProjectSwitcher({
  projects,
  active,
  className,
}: {
  projects: readonly PortalShellProject[];
  active: PortalShellProject | null;
  className?: string;
}) {
  const t = useTranslations('contractorPortal');
  const router = useRouter();
  if (projects.length === 0) return null;

  const groups = new Map<string, PortalShellProject[]>();
  for (const project of projects) {
    const list = groups.get(project.organizationId) ?? [];
    list.push(project);
    groups.set(project.organizationId, list);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('shell.switchProject')}
        className={cn(
          pressableClassName,
          'flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm shadow-sm',
          'hover:border-[var(--pf-teal-200)] hover:bg-[var(--pf-teal-50)]/40',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate text-start font-medium">
          {active ? portalProjectLabel(t, active) : t('shell.allProjects')}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-[var(--pf-text-muted)]" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">
        {[...groups.values()].map((group, index) => (
          <React.Fragment key={group[0]!.organizationId}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="flex items-center gap-2 text-xs font-semibold text-[var(--pf-text-secondary)]">
              <Building2 className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">{portalOrganizationLabel(t, group[0]!.organizationName)}</span>
            </DropdownMenuLabel>
            {group.map((project) => (
              <DropdownMenuItem key={project.projectId} onSelect={() => router.push(project.homeHref)}>
                <span className="min-w-0 flex-1 truncate">{portalProjectLabel(t, project)}</span>
                {active?.projectId === project.projectId ? (
                  <Check className="size-4 text-[var(--pf-text-brand)]" aria-hidden />
                ) : null}
              </DropdownMenuItem>
            ))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationBellLink({ href, unread }: { href: string; unread: number | null }) {
  const t = useTranslations('contractorPortal');
  const count = unread ?? 0;
  return (
    <Link
      href={href}
      aria-label={count > 0 ? t('shell.notificationsUnread', { count }) : t('nav.notifications')}
      className={cn(
        pressableChromeClassName,
        'relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl px-2',
        'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-teal-50)] hover:text-[var(--pf-accent)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
      )}
    >
      <Bell className="size-4.5" aria-hidden />
      {count > 0 ? (
        <span
          className="absolute top-1.5 end-1.5 flex min-w-4.5 justify-center rounded-full bg-[var(--pf-action-danger)] px-1 text-[0.65rem] font-semibold leading-4 text-[var(--pf-text-inverse)]"
          aria-hidden
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}

function UserMenu({
  authUserId,
  principalName,
  avatarUrl,
  vendor,
  organization,
  accountHref,
}: {
  authUserId: string;
  principalName: string | null;
  avatarUrl: string | null;
  vendor: string | null;
  organization: string | null;
  accountHref: string | null;
}) {
  const t = useTranslations('contractorPortal');
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const displayName = principalName?.trim() || t('shell.anonymousUser');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('shell.userMenu')}
        className={cn(
          pressableClassName,
          'flex min-h-11 min-w-11 items-center justify-center rounded-full p-1.5',
          'hover:bg-[var(--pf-teal-50)] active:bg-[var(--pf-action-subtle-active)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
        )}
      >
        <span className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-[var(--pf-teal-100)] text-sm font-semibold text-[var(--pf-teal-800)] ring-1 ring-[var(--pf-teal-200)]">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
            <img src={avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-medium text-[var(--pf-text-primary)]">{displayName}</span>
          {vendor ? <span className="block truncate text-xs text-[var(--pf-text-muted)]">{vendor}</span> : null}
        </DropdownMenuLabel>
        {organization ? (
          <DropdownMenuLabel className="flex items-center gap-2 font-normal">
            <Building2 className="size-4 shrink-0 text-[var(--pf-text-muted)]" aria-hidden />
            <span className="min-w-0 truncate">{organization}</span>
          </DropdownMenuLabel>
        ) : null}

        {accountHref ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push(accountHref)}>
              <UserRound aria-hidden />
              {t('nav.account')}
            </DropdownMenuItem>
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/sign-in')}>
          {t('shell.backToMainApp')}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('shell.language')}</DropdownMenuLabel>
        {LOCALES.map((option) => (
          <DropdownMenuItem
            key={option}
            disabled={pending}
            onSelect={() => {
              if (option === locale) return;
              startTransition(async () => {
                writeClientLocaleCookie(option);
                await persistExternalPrincipalLocaleAction(option);
                router.replace(pathname, { locale: option });
              });
            }}
          >
            <span className="min-w-0 flex-1 truncate">{LOCALE_METADATA[option].label}</span>
            {option === locale ? <Check className="size-4 text-[var(--pf-text-brand)]" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}

        <ThemeMenuSection />

        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          disabled={pending}
          onSelect={() => {
            startTransition(async () => {
              clearThemeClientState(authUserId);
              await resetThemeCookieForSignOutAction();
              await contractorPortalSignOutAction();
            });
          }}
        >
          <LogOut aria-hidden />
          {t('shell.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectModuleShortcuts({
  items,
  activeKey,
  t,
}: {
  items: readonly PortalNavItem[];
  activeKey: string | null;
  t: Translate;
}) {
  const modules = items.filter((item) => item.key !== 'project.home');
  const work = modules.filter((item) => isContractorWorkRouteKey(item.key));
  const finance = modules.filter((item) => isContractorFinanceRouteKey(item.key));
  const rest = modules.filter(
    (item) => !isContractorWorkRouteKey(item.key) && !isContractorFinanceRouteKey(item.key),
  );
  if (modules.length === 0) return null;

  const groups = [
    { key: 'work', labelKey: 'nav.work', items: work },
    { key: 'finance', labelKey: 'nav.finance', items: finance },
    { key: 'rest', labelKey: 'nav.more', items: rest },
  ].filter((group) => group.items.length > 0);

  return (
    <details className="group rounded-lg open:pb-1">
      <summary className="flex min-h-10 cursor-pointer list-none items-center rounded-lg px-2.5 text-sm font-medium text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-subtle)] hover:text-[var(--pf-text-primary)] [&::-webkit-details-marker]:hidden">
        {t('shell.projectShortcuts')}
      </summary>
      <div className="flex flex-col gap-3 px-0.5 pb-1 pt-1">
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-0.5">
            <p className={cn(portalSectionLabelClass, 'px-2.5')}>{t(group.labelKey)}</p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.key}>
                  <SideNavLink item={item} active={item.key === activeKey} t={t} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

function MobileTabSideLink({
  item,
  active,
  t,
}: {
  item: PortalNavItem;
  active: boolean;
  t: Translate;
}) {
  const iconKey = contractorMobileTabIconKey(item.key as Parameters<typeof contractorMobileTabIconKey>[0]);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={portalSideNavLinkClass(active)}
    >
      <span className={portalSideNavRailClass(active)} aria-hidden />
      <PortalNavIcon
        navKey={iconKey}
        className={cn('size-4 shrink-0', active ? 'text-[var(--pf-accent)]' : 'text-[var(--pf-text-muted)]')}
      />
      <span className="min-w-0 truncate">{t(item.labelKey)}</span>
    </Link>
  );
}

/** Must render inside `<WithAppClientMessages extra={['contractorPortal']}>` (the portal layout does). */
export function ContractorPortalShell({ shell, children }: { shell: PortalShellData; children: React.ReactNode }) {
  const t = useTranslations('contractorPortal');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const mobileNav = React.useMemo(() => buildPortalMobileNav(), []);
  const activeMobileTab = activeContractorMobileTab(pathname);
  const active = useActiveProject(shell.projects);
  const projectItems = active?.nav ?? [];
  const company = companyLabel(t, shell.projects, active);
  const notificationsHref = shell.primaryNav.find((item) => item.key === 'notifications')?.href ?? null;
  const accountHref = shell.primaryNav.find((item) => item.key === 'account')?.href ?? null;
  const activeProjectNavKey = activePortalNavKey(pathname, projectItems);
  const planViewer = isPortalPlanViewerPath(pathname);

  return (
    <div className={portalShellFrameClass} data-pf-contractor-portal>
      <nav className={portalSideNavClass} aria-label={t('shell.navLabel')}>
        <div className="flex h-[var(--pf-topbar-height)] shrink-0 items-center gap-2.5 border-b border-[var(--pf-border-default)] px-3.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)] shadow-sm"
            aria-hidden
          >
            <HardHat className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[var(--pf-text-primary)]">
              {company.vendor ?? t('shell.title')}
            </span>
            {company.organization ? (
              <span className="block truncate text-[0.6875rem] text-[var(--pf-text-muted)]">{company.organization}</span>
            ) : (
              <span className="block truncate text-[0.6875rem] text-[var(--pf-text-muted)]">{t('shell.title')}</span>
            )}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
          <ProjectSwitcher projects={shell.projects} active={active} className="w-full" />

          <div className="flex flex-col gap-0.5">
            <p className={cn(portalSectionLabelClass, 'px-2.5 pb-1')}>{t('shell.navLabel')}</p>
            <ul className="flex flex-col gap-0.5">
              {mobileNav.map((item) => (
                <li key={item.key}>
                  <MobileTabSideLink item={item} active={item.key === activeMobileTab} t={t} />
                </li>
              ))}
            </ul>
          </div>

          {active ? (
            <>
              <div className="mx-2 border-t border-[var(--pf-border-default)]" aria-hidden />
              <ProjectModuleShortcuts items={projectItems} activeKey={activeProjectNavKey} t={t} />
            </>
          ) : shell.projects.length > 0 ? (
            <>
              <div className="mx-2 border-t border-[var(--pf-border-default)]" aria-hidden />
              <div className="flex flex-col gap-0.5">
                <p className={cn(portalSectionLabelClass, 'px-2.5 pb-1')}>{t('shell.myProjects')}</p>
                <ul className="flex flex-col gap-0.5">
                  {shell.projects.map((project) => (
                    <li key={project.projectId}>
                      <Link href={project.homeHref} className={portalSideNavLinkClass(false)}>
                        <span className={portalSideNavRailClass(false)} aria-hidden />
                        <PortalNavIcon navKey="project.home" className="size-4 shrink-0 text-[var(--pf-text-muted)]" />
                        <span className="min-w-0 truncate">{portalProjectLabel(t, project)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </div>
      </nav>

      <div className={portalShellColumnClass}>
        <a
          href="#main"
          className="absolute start-2 -top-[100vh] z-critical h-px w-px overflow-hidden border-0 p-0 whitespace-nowrap opacity-0 focus:top-2 focus:h-auto focus:w-auto focus:overflow-visible focus:opacity-100 focus:rounded-md focus:bg-[var(--pf-bg-surface)] focus:px-3 focus:py-2 focus:text-sm focus:shadow-[var(--pf-shadow-md)]"
        >
          {tCommon('a11y.skipToContent')}
        </a>
        <header className={portalTopBarClass}>
          <span className="flex min-w-0 items-center gap-2.5 lg:hidden">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)]"
              aria-hidden
            >
              <HardHat className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block max-w-40 truncate text-sm font-semibold text-[var(--pf-text-primary)]">
                {company.vendor ?? t('shell.title')}
              </span>
              {company.organization ? (
                <span className="block max-w-40 truncate text-[0.6875rem] text-[var(--pf-text-muted)]">
                  {company.organization}
                </span>
              ) : null}
            </span>
          </span>
          <div className="min-w-0 flex-1" />
          <ProjectSwitcher projects={shell.projects} active={active} className="max-w-52 lg:hidden" />
          {notificationsHref ? <NotificationBellLink href={notificationsHref} unread={shell.unreadNotifications} /> : null}
          <ThemeHeaderToggle />
          <UserMenu
            authUserId={shell.authUserId}
            principalName={shell.principalName}
            avatarUrl={shell.avatarUrl}
            vendor={company.vendor}
            organization={company.organization}
            accountHref={accountHref}
          />
        </header>
        <main id="main" className={planViewer ? portalShellMainPlanViewerClass : portalShellMainClass}>
          {children}
        </main>
        <ScrollToTop />
        <ContractorBottomNav items={mobileNav} />
      </div>
    </div>
  );
}
