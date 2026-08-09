'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePathname, useRouter } from '@/shared/i18n/navigation';

export type ProjectTabKey =
  | 'overview'
  | 'financials'
  | 'expenses'
  | 'changes'
  | 'billing'
  | 'work'
  | 'time'
  | 'documents'
  | 'details';

interface ProjectTabsShellProps {
  /** Only the tabs this viewer can actually use, in display order. */
  tabs: readonly ProjectTabKey[];
  children: ReactNode;
}

export function ProjectTabsShell({ tabs, children }: ProjectTabsShellProps) {
  const t = useTranslations('projects.workspace.tabs');
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const tabParam = searchParams.get('tab') ?? 'overview';
  const active = tabs.includes(tabParam as ProjectTabKey) ? tabParam : (tabs[0] ?? 'overview');

  function onTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <Tabs value={active} onValueChange={onTabChange}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {t(tab)}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}
