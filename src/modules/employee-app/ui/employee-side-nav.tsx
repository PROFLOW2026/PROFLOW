'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

interface NavItem {
  readonly href: string;
  readonly labelKey: string;
  readonly visible: boolean;
}

export function EmployeeSideNav({ items }: { items: readonly NavItem[] }) {
  const t = useTranslations();
  const pathname = usePathname();
  const visible = items.filter((item) => item.visible);

  return (
    <nav
      className="hidden w-56 shrink-0 flex-col border-e border-[var(--pf-border)] bg-[var(--pf-surface)] lg:flex"
      aria-label={t('employeeApp.title')}
    >
      <ul className="flex flex-col gap-1 p-3">
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
