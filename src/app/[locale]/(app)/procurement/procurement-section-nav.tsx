'use client';

import { useTranslations } from 'next-intl';
import { SectionNavLink } from '@/components/ui/section-nav-link';

const TABS = [
  { key: 'rfqs', href: '/procurement/rfqs' },
  { key: 'orders', href: '/procurement' },
  { key: 'materials', href: '/procurement/materials' },
  { key: 'ap', href: '/procurement/ap' },
  { key: 'credits', href: '/procurement/ap/credits' },
] as const;

export function ProcurementSectionNav({
  active,
}: {
  active: 'orders' | 'rfqs' | 'materials' | 'ap' | 'credits';
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
