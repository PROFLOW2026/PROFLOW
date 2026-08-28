'use client';

import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ReactNode } from 'react';

export type Vendor360Tab = 'details' | 'projects' | 'invoices' | 'agreements' | 'documents';

interface Vendor360ShellProps {
  defaultTab?: Vendor360Tab;
  details: ReactNode;
  projects: ReactNode;
  invoices: ReactNode;
  agreements: ReactNode;
  documents: ReactNode;
  /** Collapsed under Details — performance, activity, compliance, etc. */
  detailsAdvanced?: ReactNode;
}

function AdvancedSections({ children }: { children: ReactNode }) {
  const t = useTranslations('vendors.detail.tabs');

  if (!children) return null;

  return (
    <details className="rounded-md border border-[var(--pf-border-default)]">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--pf-text-secondary)] marker:me-2">
        {t('advancedSection')}
      </summary>
      <div className="flex flex-col gap-4 border-t border-[var(--pf-border-default)] p-4">
        {children}
      </div>
    </details>
  );
}

export function Vendor360Shell({
  defaultTab = 'details',
  details,
  projects,
  invoices,
  agreements,
  documents,
  detailsAdvanced,
}: Vendor360ShellProps) {
  const t = useTranslations('vendors.detail.tabs');

  const tabs: Array<{ id: Vendor360Tab; label: string; content: ReactNode }> = [
    {
      id: 'details',
      label: t('details'),
      content: (
        <>
          {details}
          <AdvancedSections>{detailsAdvanced}</AdvancedSections>
        </>
      ),
    },
    { id: 'projects', label: t('projects'), content: projects },
    { id: 'invoices', label: t('invoices'), content: invoices },
    { id: 'agreements', label: t('agreements'), content: agreements },
    { id: 'documents', label: t('documents'), content: documents },
  ];

  return (
    <Tabs defaultValue={defaultTab} className="flex min-w-0 flex-col gap-4">
      <TabsList aria-label={t('label')}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="flex min-w-0 flex-col gap-4">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
