import type { ReactNode } from 'react';
import { pressableClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { type ProjectHubKey } from './project-hub-order';
import { defaultSectionForHub } from './project-hub-order';

export interface ProjectTabsListProps {
  tabs: readonly ProjectHubKey[];
  activeHub: ProjectHubKey;
  labels: Readonly<Partial<Record<ProjectHubKey, string>>>;
  projectHref: string;
  dir?: 'rtl' | 'ltr';
}

function hubHref(projectHref: string, hub: ProjectHubKey): string {
  if (hub === 'overview') return projectHref;
  const section = defaultSectionForHub(hub);
  return `${projectHref}?tab=${section}`;
}

export function ProjectTabsList({
  tabs,
  activeHub,
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
      {tabs.map((hub) => {
        const selected = hub === activeHub;
        return (
          <Link
            key={hub}
            href={hubHref(projectHref, hub)}
            role="tab"
            data-tab={hub}
            data-state={selected ? 'active' : 'inactive'}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            scroll={false}
            prefetch={false}
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
            )}
          >
            <span className="inline-flex items-center gap-1.5" data-pf-tab-label="">
              {labels[hub] ?? hub}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function ProjectTabsFrame({
  tabs,
  activeHub,
  labels,
  projectHref,
  dir,
  children,
}: ProjectTabsListProps & { children?: ReactNode }) {
  return (
    <div className="min-w-0 max-w-full" dir={dir}>
      <ProjectTabsList
        tabs={tabs}
        activeHub={activeHub}
        labels={labels}
        projectHref={projectHref}
        dir={dir}
      />
      {children}
    </div>
  );
}
