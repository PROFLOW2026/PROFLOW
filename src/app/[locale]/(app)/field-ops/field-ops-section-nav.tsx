'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

const SECTIONS = [
  { key: 'logs' as const, href: '/field-ops/logs' },
  { key: 'punch' as const, href: '/field-ops/punch' },
  { key: 'inspections' as const, href: '/field-ops/inspections' },
];

const tabClassName =
  'inline-flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]';

export function FieldOpsSectionNav({
  active,
}: {
  active: 'logs' | 'punch' | 'inspections';
}) {
  const t = useTranslations('fieldOps');

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
