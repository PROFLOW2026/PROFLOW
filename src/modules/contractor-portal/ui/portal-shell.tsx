'use client';

import { Bell, Building2, Check, ChevronsUpDown, HardHat, LogOut, MoreHorizontal, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { pressableChromeClassName, pressableClassName } from '@/components/ui/pressable';
import { LOCALE_COOKIE_NAME } from '@/shared/i18n/auth-locale';
import { LOCALES, LOCALE_METADATA, type Locale } from '@/shared/i18n/config';
import { Link, usePathname, useRouter } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { contractorPortalSignOutAction } from '../application/actions';
import type { PortalShellData, PortalShellProject } from '../application/load-portal-session';
import {
  activePortalNavKey,
  projectIdFromPortalPath,
  splitBottomNav,
  type PortalNavItem,
} from '../domain/nav';
import { portalOrganizationLabel, portalProjectLabel } from './labels';
import { PortalNavIcon } from './portal-nav-icon';

type Translate = ReturnType<typeof useTranslations>;

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
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
        active
          ? 'bg-[var(--pf-accent-soft)] text-[var(--pf-accent)]'
          : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-surface-2)] hover:text-[var(--pf-text)]',
      )}
    >
      <PortalNavIcon navKey={item.key} className="size-4 shrink-0" />
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
          'flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate text-start font-medium">
          {active ? portalProjectLabel(t, active) : t('shell.allProjects')}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-[var(--pf-text-muted)]" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70dvh] min-w-64 overflow-y-auto">
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
        'relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2',
        'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-muted)] hover:text-[var(--pf-text-primary)]',
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
  principalName,
  vendor,
  organization,
  accountHref,
}: {
  principalName: string | null;
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
          'hover:bg-[var(--pf-bg-muted)] active:bg-[var(--pf-action-subtle-active)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
        )}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-[var(--pf-teal-100)] text-sm font-semibold text-[var(--pf-teal-800)]">
          {displayName.charAt(0).toUpperCase()}
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
        <DropdownMenuLabel>{t('shell.language')}</DropdownMenuLabel>
        {LOCALES.map((option) => (
          <DropdownMenuItem
            key={option}
            disabled={pending}
            onSelect={() => {
              if (option === locale) return;
              startTransition(() => {
                document.cookie = `${LOCALE_COOKIE_NAME}=${option}; path=/; max-age=31536000; samesite=lax`;
                router.replace(pathname, { locale: option });
              });
            }}
          >
            <span className="min-w-0 flex-1 truncate">{LOCALE_METADATA[option].label}</span>
            {option === locale ? <Check className="size-4 text-[var(--pf-text-brand)]" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          disabled={pending}
          onSelect={() => {
            startTransition(async () => {
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

function BottomNav({ primary, projectItems }: { primary: readonly PortalNavItem[]; projectItems: readonly PortalNavItem[] }) {
  const t = useTranslations('contractorPortal');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const { visible, overflow } = splitBottomNav(primary, projectItems);
  const activeKey = activePortalNavKey(pathname, [...visible, ...overflow]);
  const moreActive = overflow.some((item) => item.key === activeKey);

  const itemClass = (active: boolean) =>
    cn(
      pressableChromeClassName,
      'flex h-[var(--pf-bottomnav-height)] w-full min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] font-medium',
      active
        ? 'text-[var(--pf-accent)]'
        : 'text-[var(--pf-text-secondary)] active:bg-[var(--pf-action-subtle-active)]',
    );

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 box-border min-w-0 border-t border-[var(--pf-border)] bg-[var(--pf-surface)] pb-[env(safe-area-inset-bottom,0px)] lg:hidden print:hidden"
        aria-label={t('shell.navLabel')}
        data-pf-contractor-mobile-nav=""
      >
        <ul className="flex h-[var(--pf-bottomnav-height)] w-full min-w-0 items-stretch">
          {visible.map((item) => (
            <li key={item.key} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={item.key === activeKey ? 'page' : undefined}
                className={itemClass(item.key === activeKey)}
              >
                <PortalNavIcon navKey={item.key} className="size-5" />
                <span className="max-w-full truncate">{t(item.labelKey)}</span>
              </Link>
            </li>
          ))}
          {overflow.length > 0 ? (
            <li className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-expanded={moreOpen}
                aria-haspopup="dialog"
                aria-controls="pf-contractor-mobile-nav-more"
                className={itemClass(moreOpen || moreActive)}
              >
                <MoreHorizontal className="size-5" aria-hidden />
                <span className="max-w-full truncate">{t('nav.more')}</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      {overflow.length > 0 ? (
        <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
          <DialogContent
            id="pf-contractor-mobile-nav-more"
            closeLabel={tCommon('actions.close')}
            aria-describedby={undefined}
          >
            <DialogHeader>
              <DialogTitle>{t('nav.more')}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <ul className="flex flex-col gap-1">
                {overflow.map((item) => (
                  <li key={item.key} onClick={() => setMoreOpen(false)}>
                    <SideNavLink item={item} active={item.key === activeKey} t={t} />
                  </li>
                ))}
              </ul>
            </DialogBody>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

/** Must render inside `<WithClientMessages extra={['contractorPortal']}>` (the portal layout does). */
export function ContractorPortalShell({ shell, children }: { shell: PortalShellData; children: React.ReactNode }) {
  const t = useTranslations('contractorPortal');
  const pathname = usePathname();
  const active = useActiveProject(shell.projects);
  const projectItems = active?.nav ?? [];
  const company = companyLabel(t, shell.projects, active);
  const notificationsHref = shell.primaryNav.find((item) => item.key === 'notifications')?.href ?? null;
  const accountHref = shell.primaryNav.find((item) => item.key === 'account')?.href ?? null;
  const primaryForNav = shell.primaryNav.filter((item) => item.key !== 'account');
  const activeKey = activePortalNavKey(pathname, [...primaryForNav, ...projectItems]);

  return (
    <div className="flex h-svh overflow-hidden" data-pf-contractor-portal>
      <nav
        className="hidden w-[var(--pf-sidebar-width)] shrink-0 flex-col border-e border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] lg:flex print:hidden"
        aria-label={t('shell.navLabel')}
      >
        <div className="flex h-[var(--pf-topbar-height)] items-center gap-2 border-b border-[var(--pf-border-default)] px-4">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)]" aria-hidden>
            <HardHat className="size-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{company.vendor ?? t('shell.title')}</span>
            {company.organization ? (
              <span className="block truncate text-xs text-[var(--pf-text-secondary)]">{company.organization}</span>
            ) : null}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-2">
          <ProjectSwitcher projects={shell.projects} active={active} className="w-full" />

          <ul className="flex flex-col gap-0.5">
            {primaryForNav.map((item) => (
              <li key={item.key}>
                <SideNavLink item={item} active={item.key === activeKey} t={t} />
              </li>
            ))}
          </ul>

          {active ? (
            <div className="flex flex-col gap-0.5">
              <p className="truncate px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-secondary)]">
                {portalProjectLabel(t, active)}
              </p>
              <ul className="flex flex-col gap-0.5">
                {projectItems.map((item) => (
                  <li key={item.key}>
                    <SideNavLink item={item} active={item.key === activeKey} t={t} />
                  </li>
                ))}
              </ul>
            </div>
          ) : shell.projects.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-secondary)]">
                {t('shell.myProjects')}
              </p>
              <ul className="flex flex-col gap-0.5">
                {shell.projects.map((project) => (
                  <li key={project.projectId}>
                    <Link
                      href={project.homeHref}
                      className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[var(--pf-text-secondary)] transition-colors hover:bg-[var(--pf-surface-2)] hover:text-[var(--pf-text)]"
                    >
                      <PortalNavIcon navKey="project.home" className="size-4 shrink-0" />
                      <span className="min-w-0 truncate">{portalProjectLabel(t, project)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-40 flex h-[var(--pf-topbar-height)] w-full shrink-0 items-center gap-2 border-b border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 print:hidden sm:gap-3">
          <span className="min-w-0 lg:hidden">
            <span className="block max-w-40 truncate text-sm font-semibold">{company.vendor ?? t('shell.title')}</span>
            {company.organization ? (
              <span className="block max-w-40 truncate text-xs text-[var(--pf-text-secondary)]">{company.organization}</span>
            ) : null}
          </span>
          <div className="min-w-0 flex-1" />
          <ProjectSwitcher projects={shell.projects} active={active} className="max-w-48 lg:hidden" />
          {notificationsHref ? <NotificationBellLink href={notificationsHref} unread={shell.unreadNotifications} /> : null}
          <UserMenu
            principalName={shell.principalName}
            vendor={company.vendor}
            organization={company.organization}
            accountHref={accountHref}
          />
        </header>
        <main className="mx-auto min-h-0 w-full max-w-lg flex-1 overflow-y-auto bg-[var(--pf-bg-page)] px-4 pt-4 pb-[var(--pf-employee-main-bottom)] lg:max-w-5xl lg:pb-6">
          {children}
        </main>
        <BottomNav primary={primaryForNav} projectItems={projectItems} />
      </div>
    </div>
  );
}