'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useQueryTabPending } from '@/components/patterns/query-tab-pending';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePathname, useRouter } from '@/shared/i18n/navigation';
import { TabPanelSkeleton } from './tab-panel-skeleton';

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

/** Optional / module-gated tabs shown after core commercial tabs. */
const SECONDARY_TABS = new Set<ProjectTabKey>(['work', 'time', 'documents']);

interface ProjectTabsShellProps {
  /** Only the tabs this viewer can actually use, in display order. */
  tabs: readonly ProjectTabKey[];
  /** Active tab from the server (`?tab=`), so the shell does not need `useSearchParams`. */
  activeTab: ProjectTabKey;
  children: ReactNode;
}

/**
 * Project workspace underline tabs.
 *
 * Soft-nav via `router.replace(?tab=)` — not separate Next routes — with
 * immediate optimistic selection + panel skeleton via `useQueryTabPending`.
 */
export function ProjectTabsShell({ tabs, activeTab, children }: ProjectTabsShellProps) {
  const t = useTranslations('projects.workspace.tabs');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const router = useRouter();
  const { displayTab, isPending, navigateTab } = useQueryTabPending(activeTab);

  function onTabChange(value: string) {
    navigateTab(value, () => {
      const params = new URLSearchParams();
      if (value !== 'overview') {
        params.set('tab', value);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <Tabs value={displayTab} onValueChange={onTabChange} className="min-w-0 max-w-full">
      <TabsList className="min-w-0 max-w-full" aria-busy={isPending || undefined}>
        {tabs.map((tab) => {
          const pendingThis = isPending && displayTab === tab;
          const secondary = SECONDARY_TABS.has(tab);
          return (
            <TabsTrigger
              key={tab}
              value={tab}
              disabled={isPending && displayTab !== tab}
              data-pending={pendingThis ? '' : undefined}
              className={
                pendingThis
                  ? 'opacity-90'
                  : secondary
                    ? 'font-normal text-[var(--pf-text-muted)]'
                    : undefined
              }
            >
              <span className="inline-flex items-center gap-1.5">
                {pendingThis ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                ) : null}
                {t(tab)}
                {pendingThis ? (
                  <span className="sr-only">{tCommon('a11y.navigating')}</span>
                ) : null}
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>
      <div className="min-w-0 max-w-full" aria-busy={isPending || undefined}>
        {isPending ? (
          <div className="pt-4">
            <TabPanelSkeleton />
          </div>
        ) : (
          children
        )}
      </div>
    </Tabs>
  );
}
