'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

const SECTIONS = [
  { key: 'assets' as const, href: '/assets' },
  { key: 'fleet' as const, href: '/assets/fleet' },
  { key: 'maintenance' as const, href: '/assets/maintenance' },
  { key: 'inventory' as const, href: '/assets/inventory' },
];

const tabClassName =
  'inline-flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]';

export function AssetsSectionNav({
  active,
}: {
  active: 'assets' | 'fleet' | 'maintenance' | 'inventory';
}) {
  const t = useTranslations('assets');

  return (
    <nav
      className="flex flex-wrap gap-2 border-b border-[var(--pf-border-default)] pb-3"
      aria-label={t('navLabel')}
    >
      {SECTIONS.map((section) => {
        const isActive = section.key === active;
        return (
          <Link
            key={section.key}
            href={section.href}
            className={cn(
              tabClassName,
              isActive
                ? 'bg-[var(--pf-bg-muted)] font-medium'
                : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-muted)]',
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            {t(`nav.${section.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
