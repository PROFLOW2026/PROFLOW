'use client';

import { Suspense, type ReactNode } from 'react';
import { isOwnerExecutionWorkspacePath } from '@/modules/project-workspace/domain/execution-workspace-path';
import { isOwnerProjectWorkWorkspacePath } from '@/modules/project-workspace/domain/project-work-workspace-path';
import { usePathname } from '@/shared/i18n/navigation';
import { ProjectCommercialTabFrame } from './project-commercial-tab-frame';
import { TabPanelSkeleton } from './tab-panel-skeleton';
import { type ProjectHubKey } from './project-hub-order';

export type ProjectOwnerWorkspaceMode = 'commercial' | 'work' | 'execution';

export function resolveProjectOwnerWorkspaceMode(
  pathname: string,
  projectId: string,
): ProjectOwnerWorkspaceMode {
  if (isOwnerProjectWorkWorkspacePath(pathname, projectId)) return 'work';
  if (isOwnerExecutionWorkspacePath(pathname, projectId)) return 'execution';
  return 'commercial';
}

interface ProjectOwnerWorkspaceShellProps {
  projectId: string;
  dir: 'rtl' | 'ltr';
  commercialTop: ReactNode;
  workChrome: ReactNode;
  executionChrome: ReactNode;
  tabs: readonly ProjectHubKey[];
  tabLabels: Readonly<Partial<Record<ProjectHubKey, string>>>;
  children: ReactNode;
}

/**
 * Switches commercial vs operational project chrome from the live URL.
 *
 * Parent `layout.tsx` is a Server Component and does not re-run on client
 * navigations between sibling routes; pathname must be read here.
 * Operational chrome is passed as server-rendered slots (async RSC nav/header).
 */
export function ProjectOwnerWorkspaceShell({
  projectId,
  dir,
  commercialTop,
  workChrome,
  executionChrome,
  tabs,
  tabLabels,
  children,
}: ProjectOwnerWorkspaceShellProps) {
  const pathname = usePathname();
  const mode = resolveProjectOwnerWorkspaceMode(pathname, projectId);
  const projectHref = `/projects/${projectId}`;

  const panelFallback = (
    <div className="min-w-0 max-w-full pt-4">
      <TabPanelSkeleton />
    </div>
  );

  if (mode === 'work') {
    return (
      <div className="flex flex-col gap-6">
        {workChrome}
        <Suspense fallback={panelFallback}>{children}</Suspense>
      </div>
    );
  }

  if (mode === 'execution') {
    return (
      <div className="flex flex-col gap-6">
        {executionChrome}
        <Suspense fallback={panelFallback}>{children}</Suspense>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {commercialTop}
      <ProjectCommercialTabFrame
        tabs={tabs}
        labels={tabLabels}
        projectHref={projectHref}
        dir={dir}
      >
        <Suspense
          fallback={
            <div className="min-w-0 max-w-full">
              <div className="pt-4">
                <TabPanelSkeleton />
              </div>
            </div>
          }
        >
          {children}
        </Suspense>
      </ProjectCommercialTabFrame>
    </div>
  );
}
