'use client';

import type { ReactNode } from 'react';
import { type ProjectHubKey } from './project-hub-order';
import { ProjectTabsEnhancer } from './project-tabs-enhancer';
import { ProjectTabsList } from './project-tabs-list';

interface ProjectCommercialTabFrameProps {
  tabs: readonly ProjectHubKey[];
  activeHub?: ProjectHubKey;
  projectHref: string;
  labels: Readonly<Partial<Record<ProjectHubKey, string>>>;
  dir: 'rtl' | 'ltr';
  children: ReactNode;
}

/** Client-safe project hub tabs + panel (mirrors `ProjectTabsShell` for workspace shell). */
export function ProjectCommercialTabFrame({
  tabs,
  activeHub,
  projectHref,
  labels,
  dir,
  children,
}: ProjectCommercialTabFrameProps) {
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
