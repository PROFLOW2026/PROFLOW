import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import type { Task } from '../domain/types';
import { loadProjectDisplayNameMap } from '@/modules/projects/application/project-display-names';

/** Attach formatted project labels to lean task rows for UI display. */
export async function enrichTasksWithProjectDisplayNames(
  context: OrgContext,
  tasks: readonly Task[],
): Promise<Map<string, string>> {
  const projectIds = tasks.map((task) => task.projectId).filter((id): id is string => Boolean(id));
  return loadProjectDisplayNameMap(context.db, context.organizationId, projectIds);
}

export function projectDisplayNameForTask(
  task: Pick<Task, 'projectId'>,
  labels: ReadonlyMap<string, string>,
): string | null {
  if (!task.projectId) return null;
  return labels.get(task.projectId) ?? null;
}
