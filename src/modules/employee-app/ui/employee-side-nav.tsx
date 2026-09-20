'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { OrgShellMark } from '@/components/shell/org-shell-mark';
import { cn } from '@/shared/ui/cn';

interface NavItem {
  readonly href: string;
  readonly labelKey: string;
  readonly visible: boolean;
}

export function EmployeeSideNav({
  items,
  organizationName,
}: {
  items: readonly NavItem[];
  organizationName: string;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const visible = items.filter((item) => item.visible);

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

      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {visible.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
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
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
