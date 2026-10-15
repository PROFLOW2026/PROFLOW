import 'server-only';

import { listTasksLinkedFrom } from '@/modules/collaboration';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { PROJECT_CAPABILITIES, assertProjectCapability } from '@/modules/project-team';
import type { TaskLinkSummary, TaskStatus } from '../domain/types';
import { listAccessibleTasks } from './list-tasks';

export function filterCandidatesForBusinessLink<
  T extends { readonly id: string; readonly projectId: string | null },
>(
  candidates: readonly T[],
  projectId: string,
  linkedIds: ReadonlySet<string>,
): T[] {
  return candidates
    .filter((task) => task.projectId === projectId && !linkedIds.has(task.id))
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export interface BusinessLinkSource {
  readonly entityType: string;
  readonly entityId: string;
}

/**
 * Tasks the caller may link to a business entity (quote / work order project),
 * excluding tasks already linked from that source.
 */
export async function listLinkableProjectTasks(
  context: OrgContext,
  projectId: string,
  source: BusinessLinkSource,
): Promise<TaskLinkSummary[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);
  await assertProjectCapability(context, projectId, PROJECT_CAPABILITIES.TASKS_MANAGE);

  const [candidates, alreadyLinked] = await Promise.all([
    listAccessibleTasks(context, {
      projectId,
      includeArchived: false,
      limit: 200,
    }),
    listTasksLinkedFrom(context.db, context.organizationId, source.entityType, source.entityId),
  ]);

  const linkedIds = new Set(alreadyLinked.map((row) => row.id));
  return filterCandidatesForBusinessLink(candidates, projectId, linkedIds)
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status as TaskStatus,
      dueDate: task.dueDate,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}
