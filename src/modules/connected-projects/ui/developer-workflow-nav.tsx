'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/shared/i18n/navigation';
import {
  developerWorkflowHref,
  type DeveloperWorkflowTab,
} from '../domain/developer-workflows';

interface DeveloperWorkflowNavProps {
  readonly contractorProjectId: string;
  readonly tabs: readonly DeveloperWorkflowTab[];
}

export function DeveloperWorkflowNav({ contractorProjectId, tabs }: DeveloperWorkflowNavProps) {
  const t = useTranslations('projects.connectedDeveloper');
  const pathname = usePathname();

  if (tabs.length === 0) return null;

  return (
    <nav aria-label={t('navLabel')} className="border-b border-[var(--pf-border-default)]">
      <ul className="-mb-px flex flex-wrap gap-4">
        {tabs.map((tab) => {
          const href = developerWorkflowHref(contractorProjectId, tab.segment);
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={tab.key}>
              <Link
                href={href}
                prefetch
                className={`inline-block border-b-2 pb-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-[var(--pf-accent)] text-[var(--pf-text-primary)]'
                    : 'border-transparent text-[var(--pf-text-secondary)] hover:text-[var(--pf-text-primary)]'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {t(tab.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
