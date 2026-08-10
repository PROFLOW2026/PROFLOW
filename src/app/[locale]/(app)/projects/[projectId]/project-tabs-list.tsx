import type { ReactNode } from 'react';
import { pressableClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { type ProjectTabKey } from './project-tab-order';

/** Setup / configuration tabs — visually quieter than day-to-day ops. */
const SECONDARY_TABS = new Set<ProjectTabKey>(['work', 'details']);

export interface ProjectTabsListProps {
  tabs: readonly ProjectTabKey[];
  activeTab: ProjectTabKey;
  labels: Readonly<Partial<Record<ProjectTabKey, string>>>;
  /** Absolute app path for this project (`/projects/{id}`) — enables no-JS tab navigation. */
  projectHref: string;
  dir?: 'rtl' | 'ltr';
}

function tabHref(projectHref: string, tab: ProjectTabKey): string {
  return tab === 'overview' ? projectHref : `${projectHref}?tab=${tab}`;
}

/**
 * Server-safe tablist host markup. Soft-nav Flight can reveal
 * `aria-selected` here without waiting on the client enhancer chunk.
 * Links navigate even before the enhancer hydrates; the enhancer upgrades
 * clicks to soft `router.replace` when ready.
 */
export function ProjectTabsList({
  tabs,
  activeTab,
  labels,
  projectHref,
  dir,
}: ProjectTabsListProps) {
  return (
    <div
      role="tablist"
      data-pf-project-tabs=""
      dir={dir}
      className={cn(
        'flex min-w-0 max-w-full w-full items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-[var(--pf-border-default)]',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      {tabs.map((tab) => {
        const selected = tab === activeTab;
        const secondary = SECONDARY_TABS.has(tab);
        return (
          <Link
            key={tab}
            href={tabHref(projectHref, tab)}
            role="tab"
            data-tab={tab}
            data-state={selected ? 'active' : 'inactive'}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            scroll={false}
            className={cn(
              'relative shrink-0 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-start',
              'min-h-11',
              pressableClassName,
              'text-[var(--pf-text-secondary)]',
              'hover:text-[var(--pf-text-primary)]',
              'active:bg-[var(--pf-action-subtle-hover)] active:text-[var(--pf-text-primary)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
              'data-[state=active]:border-[var(--pf-action-primary)] data-[state=active]:text-[var(--pf-text-brand)]',
              'data-[state=active]:active:bg-[var(--pf-action-subtle-active)]',
              'data-[pending]:cursor-wait data-[pending]:opacity-90 data-[pending]:text-[var(--pf-text-brand)]',
              'aria-disabled:pointer-events-none aria-disabled:opacity-50',
              secondary ? 'font-normal text-[var(--pf-text-muted)]' : undefined,
            )}
          >
            <span className="inline-flex items-center gap-1.5" data-pf-tab-label="">
              {labels[tab] ?? tab}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** Test / story helper: list + children wrapper. */
export function ProjectTabsFrame({
  tabs,
  activeTab,
  labels,
  projectHref,
  dir,
  children,
}: ProjectTabsListProps & { children?: ReactNode }) {
  return (
    <div className="min-w-0 max-w-full" dir={dir}>
      <ProjectTabsList
        tabs={tabs}
        activeTab={activeTab}
        labels={labels}
        projectHref={projectHref}
        dir={dir}
      />
      {children}
    </div>
  );
}
