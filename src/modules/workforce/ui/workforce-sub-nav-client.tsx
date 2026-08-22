'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from '@/shared/i18n/navigation';

export type WorkforceTab = 'employees' | 'time' | 'attendance' | 'approvals' | 'timesheets';

export interface WorkforceSubNavTab {
  readonly value: WorkforceTab;
  readonly href: string;
  readonly label: string;
}

interface WorkforceSubNavClientProps {
  readonly active: WorkforceTab;
  readonly tabs: readonly WorkforceSubNavTab[];
}

/**
 * Client tab strip: TabsTrigger `asChild` + Link must share a client boundary
 * (RSC-passed Link children break Radix Slot).
 */
export function WorkforceSubNavClient({ active, tabs }: WorkforceSubNavClientProps) {
  return (
    <Tabs value={active}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} asChild>
            <Link href={tab.href}>{tab.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
