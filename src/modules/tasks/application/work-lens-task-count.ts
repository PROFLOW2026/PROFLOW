import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { resolveAccessibleProjectIds } from '@/modules/projects/application/project-access';
import { countTasksMatching } from '../data/tasks.repository';
import { parseWorkTaskListFilters } from '../domain/work-task-search-params';
import { resolveAccessibleWorkspaceIds } from './accessible-workspaces';

export async function countAccessibleWorkLensTasks(
  context: OrgContext,
  urlParams: Record<string, string | string[] | undefined>,
): Promise<number> {
  const filters = parseWorkTaskListFilters(urlParams);
  const [workspaceIds, accessibleProjectIds] = await Promise.all([
    resolveAccessibleWorkspaceIds(context),
    resolveAccessibleProjectIds(context),
  ]);
  if (workspaceIds.length === 0) return 0;

  return countTasksMatching(context.db, context.organizationId, workspaceIds, filters, {
    accessibleProjectIds,
  });
}
