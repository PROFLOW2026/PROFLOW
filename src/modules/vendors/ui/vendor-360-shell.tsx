'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  MainAppDetailAdvancedSection,
  MainAppDetailTabsContent,
  MainAppDetailTabsList,
  MainAppDetailTabsShell,
  MainAppDetailTabsTrigger,
} from '@/components/patterns/main-app/main-app-detail-tabs-shell';

export type Vendor360Tab =
  | 'details'
  | 'portal'
  | 'projects'
  | 'invoices'
  | 'agreements'
  | 'documents';

interface Vendor360ShellProps {
  defaultTab?: Vendor360Tab;
  details: ReactNode;
  /** Portal users, passwords, and grant management (reuses contractor-access). */
  portal?: ReactNode;
  projects: ReactNode;
  invoices: ReactNode;
  agreements: ReactNode;
  documents: ReactNode;
  /** Collapsed under Details — performance, activity, compliance, etc. */
  detailsAdvanced?: ReactNode;
}

export function Vendor360Shell({
  defaultTab = 'details',
  details,
  portal,
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
          <MainAppDetailAdvancedSection title={t('advancedSection')}>
            {detailsAdvanced}
          </MainAppDetailAdvancedSection>
        </>
      ),
    },
    ...(portal
      ? [{ id: 'portal' as const, label: t('portal'), content: portal }]
      : []),
    { id: 'projects', label: t('projects'), content: projects },
    { id: 'agreements', label: t('agreements'), content: agreements },
    { id: 'invoices', label: t('invoices'), content: invoices },
    { id: 'documents', label: t('documents'), content: documents },
  ];

  return (
    <MainAppDetailTabsShell defaultValue={defaultTab}>
      <MainAppDetailTabsList aria-label={t('label')}>
        {tabs.map((tab) => (
          <MainAppDetailTabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </MainAppDetailTabsTrigger>
        ))}
      </MainAppDetailTabsList>
      {tabs.map((tab) => (
        <MainAppDetailTabsContent key={tab.id} value={tab.id}>
          {tab.content}
        </MainAppDetailTabsContent>
      ))}
    </MainAppDetailTabsShell>
  );
}
