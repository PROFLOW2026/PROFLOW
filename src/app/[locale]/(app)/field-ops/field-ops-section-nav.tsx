'use client';

import { useTranslations } from 'next-intl';
import { SectionNavLink } from '@/components/ui/section-nav-link';

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
  const t = useTranslations('fieldOps');

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
