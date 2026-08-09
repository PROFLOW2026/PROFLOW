import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { SectionNavLink } from '@/components/ui/section-nav-link';

const SECTIONS = [
  { href: '/crm', key: 'opportunities' as const },
  { href: '/crm/prospects', key: 'prospects' as const },
  { href: '/crm/leads', key: 'leads' as const },
];

export async function CrmSectionNav({ active }: { active: 'opportunities' | 'prospects' | 'leads' }) {
  const t = await getTranslations('crm');

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

export function CrmShell({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6">{children}</div>;
}
