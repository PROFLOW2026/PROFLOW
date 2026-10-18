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
      <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 shadow-[var(--pf-shadow-sm)] md:gap-5 md:p-4">
        <div className="space-y-3 border-b border-[var(--pf-border-default)] pb-3">{workChrome}</div>
        <div className="min-w-0">{children}</div>
      </div>
    );
  }

  if (mode === 'execution') {
    return (
      <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 shadow-[var(--pf-shadow-sm)] md:gap-5 md:p-4">
        <div className="space-y-3 border-b border-[var(--pf-border-default)] pb-3">
          {executionChrome}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 md:gap-5">
      {commercialTop ? (
        <div className="rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 py-2 shadow-[var(--pf-shadow-sm)]">
          {commercialTop}
        </div>
      ) : null}
      {children}
    </div>
  );
}
