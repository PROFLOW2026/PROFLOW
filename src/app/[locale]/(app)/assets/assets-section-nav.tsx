'use client';

import { useTranslations } from 'next-intl';
import { SectionNavLink } from '@/components/ui/section-nav-link';

const SECTIONS = [
  { key: 'assets' as const, href: '/assets' },
  { key: 'fleet' as const, href: '/assets/fleet' },
  { key: 'maintenance' as const, href: '/assets/maintenance' },
  { key: 'inventory' as const, href: '/assets/inventory' },
];

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
      {SECTIONS.map((section) => (
        <SectionNavLink key={section.key} href={section.href} active={section.key === active}>
          {t(`nav.${section.key}`)}
        </SectionNavLink>
      ))}
    </nav>
  );
}
