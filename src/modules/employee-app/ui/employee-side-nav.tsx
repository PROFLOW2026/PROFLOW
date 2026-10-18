'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { OrgShellMark } from '@/components/shell/org-shell-mark';
import { partitionEmployeeNavItems } from '@/modules/employee-app/application/employee-navigation';
import type { EmployeeNavItem } from '@/modules/employee-app/application/get-employee-shell';
import { cn } from '@/shared/ui/cn';
import { EmployeeNavIcon, employeeNavIconKeyFromHref } from './employee-nav-icon';

function NavLink({
  item,
  pathname,
  t,
}: {
  item: EmployeeNavItem;
  pathname: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const current =
    item.href === '/employee'
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'group relative flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
        current
          ? 'bg-[var(--pf-accent-soft)] text-[var(--pf-accent)]'
          : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-subtle)] hover:text-[var(--pf-text-primary)]',
      )}
    >
      <span
        className={cn(
          'absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-[var(--pf-accent)] transition-opacity',
          current ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden
      />
      <EmployeeNavIcon
        iconKey={employeeNavIconKeyFromHref(item.href)}
        className={cn(
          'size-4 shrink-0',
          current ? 'text-[var(--pf-accent)]' : 'text-[var(--pf-text-muted)] group-hover:text-[var(--pf-text-secondary)]',
        )}
      />
      <span className="min-w-0 truncate">{t(item.labelKey)}</span>
    </Link>
  );
}

function NavSection({
  label,
  items,
  pathname,
  t,
}: {
  label: string;
  items: readonly EmployeeNavItem[];
  pathname: string;
  t: ReturnType<typeof useTranslations>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-2.5 pb-1.5 pt-1 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--pf-text-muted)]">
        {label}
      </p>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item.href}>
            <NavLink item={item} pathname={pathname} t={t} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmployeeSideNav({
  items,
  organizationName,
}: {
  items: readonly EmployeeNavItem[];
  organizationName: string;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const { planner, management } = partitionEmployeeNavItems(items);
  const showManagementSection = management.length > 0;

  return (
    <nav
      className="sticky top-0 hidden h-svh w-[var(--pf-sidebar-width)] shrink-0 flex-col border-e border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] lg:flex print:hidden"
      aria-label={t('employeeApp.title')}
    >
      <div className="flex h-[var(--pf-topbar-height)] shrink-0 items-center gap-2.5 border-b border-[var(--pf-border-default)] px-3.5">
        <OrgShellMark organizationName={organizationName} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--pf-text-primary)]" title={organizationName}>
            {organizationName}
          </p>
          <p className="truncate text-[0.6875rem] text-[var(--pf-text-muted)]">{t('employeeApp.title')}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
        <NavSection
          label={t('employeeApp.nav.myWork')}
          items={planner}
          pathname={pathname}
          t={t}
        />

        {showManagementSection ? (
          <>
            <div className="mx-2 border-t border-[var(--pf-border-default)]" aria-hidden />
            <NavSection
              label={t('employeeApp.nav.managementOffice')}
              items={management}
              pathname={pathname}
              t={t}
            />
          </>
        ) : null}
      </div>
    </nav>
  );
}
