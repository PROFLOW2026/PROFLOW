'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  isEmployeeExecutionWorkspacePath,
  isOwnerExecutionWorkspacePath,
} from '@/modules/project-workspace/domain/execution-workspace-path';

export function ProjectLayoutMode({
  projectId,
  surface,
  commercial,
  execution,
}: {
  readonly projectId: string;
  readonly surface: 'owner' | 'employee';
  readonly commercial: ReactNode;
  readonly execution: ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const inExecution =
    surface === 'owner'
      ? isOwnerExecutionWorkspacePath(pathname, projectId)
      : isEmployeeExecutionWorkspacePath(pathname, projectId);

  return inExecution ? execution : commercial;
}
