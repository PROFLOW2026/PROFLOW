'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';
import { usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

interface NavItem {
  readonly href: string;
  readonly labelKey: string;
  readonly visible: boolean;
}

export function EmployeeBottomNav({ items }: { items: readonly NavItem[] }) {
  const t = useTranslations();
  const pathname = usePathname();
  const visible = items.filter((item) => item.visible);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--pf-border)] bg-[var(--pf-surface)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label={t('employeeApp.title')}
    >
      <ul className="flex items-stretch justify-around gap-1 px-2 py-2">
        {visible.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                className={cn(
                  'flex min-h-12 flex-col items-center justify-center rounded-lg px-2 text-center text-xs font-medium',
                  active
                    ? 'bg-[var(--pf-accent-soft)] text-[var(--pf-accent)]'
                    : 'text-[var(--pf-text-secondary)]',
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
