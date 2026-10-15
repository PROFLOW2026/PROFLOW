import 'server-only';

import type { PlanningDependency } from '@/modules/planning/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listTaskDependencies } from '../data/tasks.repository';
import { mapTaskDependenciesToGantt } from '../domain/map-task-dependencies-to-gantt';

export async function listTaskGanttDependencies(
  context: OrgContext,
  taskIds: readonly string[],
): Promise<PlanningDependency[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);
  if (taskIds.length === 0) return [];

  const deps = await listTaskDependencies(context.db, context.organizationId, [...taskIds]);
  return mapTaskDependenciesToGantt(deps, context.organizationId, '');
}
