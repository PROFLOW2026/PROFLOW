'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

const TABS = [
  { key: 'orders', href: '/procurement' },
  { key: 'materials', href: '/procurement/materials' },
  { key: 'ap', href: '/procurement/ap' },
] as const;

export function ProcurementSectionNav({
  active,
}: {
  active: 'orders' | 'materials' | 'ap';
}) {
  const t = useTranslations('procurement.nav');
  const pathname = usePathname();

  return (
    <nav
      aria-label="Procurement sections"
      className="flex flex-wrap gap-2 border-b border-[var(--pf-border-default)] pb-3"
    >
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-[var(--pf-teal-50)] text-[var(--pf-text-brand)]'
                : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-muted)]',
            )}
            data-pathname={pathname}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
