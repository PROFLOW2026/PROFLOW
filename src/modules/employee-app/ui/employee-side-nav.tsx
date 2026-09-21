'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { OrgShellMark } from '@/components/shell/org-shell-mark';
import { partitionEmployeeNavItems } from '@/modules/employee-app/application/employee-navigation';
import type { EmployeeNavItem } from '@/modules/employee-app/application/get-employee-shell';
import { cn } from '@/shared/ui/cn';

function NavLink({
  item,
  pathname,
  t,
}: {
  item: EmployeeNavItem;
  pathname: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      className={cn(
        'flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors',
        active
          ? 'bg-[var(--pf-accent-soft)] text-[var(--pf-accent)]'
          : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-surface-2)] hover:text-[var(--pf-text)]',
      )}
    >
      {t(item.labelKey)}
    </Link>
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
      className="hidden w-[var(--pf-sidebar-width)] shrink-0 flex-col border-e border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] lg:flex print:hidden"
      aria-label={t('employeeApp.title')}
    >
      <div className="flex h-[var(--pf-topbar-height)] items-center gap-2 border-b border-[var(--pf-border-default)] px-4">
        <OrgShellMark organizationName={organizationName} />
        <span className="min-w-0 truncate text-sm font-semibold" title={organizationName}>
          {organizationName}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        <ul className="flex flex-col gap-0.5">
          {planner.map((item) => (
            <li key={item.href}>
              <NavLink item={item} pathname={pathname} t={t} />
            </li>
          ))}
        </ul>

        {showManagementSection ? (
          <div className="mt-3 flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-secondary)]">
              {t('employeeApp.nav.managementOffice')}
            </p>
            <ul className="flex flex-col gap-0.5">
              {management.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} pathname={pathname} t={t} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
