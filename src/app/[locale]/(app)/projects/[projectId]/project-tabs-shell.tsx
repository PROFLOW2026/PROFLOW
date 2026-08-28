import type { ReactNode } from 'react';
import { type ProjectHubKey } from './project-hub-order';
import { ProjectTabsEnhancer } from './project-tabs-enhancer';
import { ProjectTabsList } from './project-tabs-list';

export type { ProjectTabKey } from './project-tab-order';
export type { ProjectHubKey } from './project-hub-order';

interface ProjectTabsShellProps {
  /** Top-level workspace hubs visible to this viewer. */
  tabs: readonly ProjectHubKey[];
  activeHub?: ProjectHubKey;
  projectHref: string;
  labels: Readonly<Partial<Record<ProjectHubKey, string>>>;
  dir: 'rtl' | 'ltr';
  children: ReactNode;
}

/**
 * Project workspace underline tabs.
 *
 * Tablist markup is a **Server Component** so soft-nav Flight includes
 * `role="tab"` + `aria-selected` immediately (open-project ready signal).
 * A lean client enhancer attaches soft-nav, optimistic pending, and URL sync —
 * layout still ignores `searchParams` so header chrome survives `?tab=` hops.
 */
export function ProjectTabsShell({
  tabs,
  activeHub,
  projectHref,
  labels,
  dir,
  children,
}: ProjectTabsShellProps) {
  const resolvedActive =
    activeHub && tabs.includes(activeHub) ? activeHub : (tabs[0] ?? 'overview');

  return (
    <div className="min-w-0 max-w-full" dir={dir}>
      <ProjectTabsList
        tabs={tabs}
        activeHub={resolvedActive}
        labels={labels}
        projectHref={projectHref}
      />
      <ProjectTabsEnhancer
        tabs={tabs}
        serverActiveHub={resolvedActive}
        activeHub={activeHub && tabs.includes(activeHub) ? activeHub : undefined}
      >
        {children}
      </ProjectTabsEnhancer>
    </div>
  );
}
