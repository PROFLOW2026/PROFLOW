'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';

const SECTIONS = [
  { key: 'logs' as const, href: '/field-ops/logs' },
  { key: 'punch' as const, href: '/field-ops/punch' },
  { key: 'inspections' as const, href: '/field-ops/inspections' },
];

export function FieldOpsSectionNav({
  active,
}: {
  active: 'logs' | 'punch' | 'inspections';
}) {
  const t = useTranslations('fieldOps.nav');

  return (
    <nav className="flex flex-wrap gap-2 border-b border-[var(--pf-border-default)] pb-3" aria-label={t('logs')}>
      {SECTIONS.map((section) => {
        const isActive = section.key === active;
        return (
          <Link
            key={section.key}
            href={section.href}
            className={
              isActive
                ? 'rounded-md bg-[var(--pf-bg-muted)] px-3 py-1.5 text-sm font-medium'
                : 'rounded-md px-3 py-1.5 text-sm text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-muted)]'
            }
            aria-current={isActive ? 'page' : undefined}
          >
            {t(section.key)}
          </Link>
        );
      })}
    </nav>
  );
}
