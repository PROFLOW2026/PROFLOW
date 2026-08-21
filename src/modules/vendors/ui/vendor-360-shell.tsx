'use client';

import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ReactNode } from 'react';

export type Vendor360Tab =
  | 'identity'
  | 'contacts'
  | 'categories'
  | 'commercial'
  | 'projects'
  | 'performance'
  | 'compliance'
  | 'documents'
  | 'activity';

interface Vendor360ShellProps {
  defaultTab?: Vendor360Tab;
  identity: ReactNode;
  contacts: ReactNode;
  categories: ReactNode;
  commercial: ReactNode;
  projects: ReactNode;
  performance: ReactNode;
  compliance?: ReactNode;
  documents: ReactNode;
  activity?: ReactNode;
}

export function Vendor360Shell({
  defaultTab = 'identity',
  identity,
  contacts,
  categories,
  commercial,
  projects,
  performance,
  compliance,
  documents,
  activity,
}: Vendor360ShellProps) {
  const t = useTranslations('vendors.detail.tabs');

  const tabs: Array<{ id: Vendor360Tab; label: string; content: ReactNode; show?: boolean }> = [
    { id: 'identity', label: t('identity'), content: identity },
    { id: 'contacts', label: t('contacts'), content: contacts },
    { id: 'categories', label: t('categories'), content: categories },
    { id: 'commercial', label: t('commercial'), content: commercial },
    { id: 'projects', label: t('projects'), content: projects },
    { id: 'performance', label: t('performance'), content: performance },
    { id: 'compliance', label: t('compliance'), content: compliance ?? null, show: Boolean(compliance) },
    { id: 'documents', label: t('documents'), content: documents },
    { id: 'activity', label: t('activity'), content: activity ?? null, show: Boolean(activity) },
  ];

  const visible = tabs.filter((tab) => tab.show !== false && tab.content != null);

  return (
    <Tabs defaultValue={defaultTab} className="flex min-w-0 flex-col gap-4">
      <TabsList aria-label={t('label')}>
        {visible.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {visible.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="flex min-w-0 flex-col gap-4">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
