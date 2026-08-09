'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';

const SECTIONS = [
  { key: 'assets' as const, href: '/assets' },
  { key: 'inventory' as const, href: '/assets/inventory' },
];

export function AssetsSectionNav({ active }: { active: 'assets' | 'inventory' }) {
  const t = useTranslations('assets.nav');

  return (
    <nav
      className="flex flex-wrap gap-2 border-b border-[var(--pf-border-default)] pb-3"
      aria-label={t('assets')}
    >
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
