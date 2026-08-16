import type { ReactNode } from 'react';
import { type ProjectTabKey } from './project-tab-order';
import { ProjectTabsEnhancer } from './project-tabs-enhancer';
import { ProjectTabsList } from './project-tabs-list';

export type { ProjectTabKey } from './project-tab-order';

interface ProjectTabsShellProps {
  /** Only the tabs this viewer can actually use, in display order. */
  tabs: readonly ProjectTabKey[];
  /**
   * Optional server hint for the active tab. Soft-nav truth still comes from
   * the URL inside the client enhancer (`?tab=`). Layout defaults to overview
   * so open-project RSC HTML can ship `aria-selected` without waiting on
   * client JS.
   */
  activeTab?: ProjectTabKey;
  /** App path for this project (`/projects/{id}`) - real hrefs before hydrate. */
  projectHref: string;
  /** Resolved tab labels from the server caller (`getTranslations`). */
  labels: Readonly<Partial<Record<ProjectTabKey, string>>>;
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
  activeTab,
  projectHref,
  labels,
  dir,
  children,
}: ProjectTabsShellProps) {
  const resolvedActive =
    activeTab && tabs.includes(activeTab) ? activeTab : (tabs[0] ?? 'overview');

  return (
    <div className="min-w-0 max-w-full" dir={dir}>
      <ProjectTabsList
        tabs={tabs}
        activeTab={resolvedActive}
        labels={labels}
        projectHref={projectHref}
      />
      <ProjectTabsEnhancer
        tabs={tabs}
        serverActiveTab={resolvedActive}
        activeTab={activeTab && tabs.includes(activeTab) ? activeTab : undefined}
      >
        {children}
      </ProjectTabsEnhancer>
    </div>
  );
}
