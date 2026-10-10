'use client';

import type { ReactNode } from 'react';
import { isEmployeeExecutionWorkspacePath } from '@/modules/project-workspace/domain/execution-workspace-path';
import { isEmployeeProjectWorkWorkspacePath } from '@/modules/project-workspace/domain/project-work-workspace-path';
import { usePathname } from '@/shared/i18n/navigation';

export function resolveEmployeeProjectWorkspaceMode(
  pathname: string,
  projectId: string,
): 'commercial' | 'work' | 'execution' {
  if (isEmployeeProjectWorkWorkspacePath(pathname, projectId)) return 'work';
  if (isEmployeeExecutionWorkspacePath(pathname, projectId)) return 'execution';
  return 'commercial';
}

interface EmployeeProjectWorkspaceShellProps {
  projectId: string;
  commercialTop: ReactNode;
  workChrome: ReactNode;
  executionChrome: ReactNode;
  children: ReactNode;
}

export function EmployeeProjectWorkspaceShell({
  projectId,
  commercialTop,
  workChrome,
  executionChrome,
  children,
}: EmployeeProjectWorkspaceShellProps) {
  const pathname = usePathname();
  const mode = resolveEmployeeProjectWorkspaceMode(pathname, projectId);

  if (mode === 'work') {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        {workChrome}
        {children}
      </div>
    );
  }

  if (mode === 'execution') {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        {executionChrome}
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {commercialTop}
      {children}
    </div>
  );
}
