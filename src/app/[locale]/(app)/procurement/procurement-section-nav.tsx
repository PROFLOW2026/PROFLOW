'use client';

import { useTranslations } from 'next-intl';
import { SectionNavLink } from '@/components/ui/section-nav-link';

const TABS = [
  { key: 'orders', href: '/procurement' },
  { key: 'rfqs', href: '/procurement/rfqs' },
  { key: 'materials', href: '/procurement/materials' },
  { key: 'ap', href: '/procurement/ap' },
] as const;

export function ProcurementSectionNav({
  active,
}: {
  active: 'orders' | 'rfqs' | 'materials' | 'ap';
}) {
  const t = useTranslations('procurement');

  return (
    <nav
      aria-label={t('navLabel')}
      className="flex min-w-0 flex-wrap gap-2 border-b border-[var(--pf-border-default)] pb-3"
    >
      {TABS.map((tab) => (
        <SectionNavLink key={tab.key} href={tab.href} active={active === tab.key}>
          {t(`nav.${tab.key}`)}
        </SectionNavLink>
      ))}
    </nav>
  );
}
