import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';

const SECTIONS = [
  { href: '/crm', key: 'opportunities' as const, exact: true },
  { href: '/crm/prospects', key: 'prospects' as const, exact: false },
  { href: '/crm/leads', key: 'leads' as const, exact: false },
];

export async function CrmSectionNav({ active }: { active: 'opportunities' | 'prospects' | 'leads' }) {
  const t = await getTranslations('crm');

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
            className={
              isActive
                ? 'inline-flex min-h-11 items-center rounded-md bg-[var(--pf-bg-muted)] px-3 py-2 text-sm font-medium'
                : 'inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-muted)]'
            }
            aria-current={isActive ? 'page' : undefined}
          >
            {t(`nav.${section.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}

export function CrmShell({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6">{children}</div>;
}
