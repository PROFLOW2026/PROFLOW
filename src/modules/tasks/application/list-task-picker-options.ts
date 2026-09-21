import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { findTaskById } from '../data/tasks.repository';
import { listAccessibleTasks } from './list-tasks';
import type { TaskLinkSummary } from '../domain/types';

/**
 * Lists tasks available for dependency linking in the same workspace/project context.
 */
export async function listTaskPickerOptions(
  context: OrgContext,
  taskId: string,
): Promise<TaskLinkSummary[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

  const candidates = await listAccessibleTasks(context, {
    workspaceId: task.workspaceId,
    ...(task.projectId ? { projectId: task.projectId } : {}),
    includeArchived: false,
    limit: 200,
  }).then((rows) =>
    rows.filter((candidate) =>
      task.projectId
        ? candidate.projectId === task.projectId
        : candidate.projectId == null,
    ),
  );

  const excludeIds = new Set<string>([taskId]);
  for (const candidate of candidates) {
    if (candidate.parentTaskId === taskId) {
      excludeIds.add(candidate.id);
    }
  }

  return candidates
    .filter((candidate) => !excludeIds.has(candidate.id))
    .map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      status: candidate.status,
      dueDate: candidate.dueDate,
    }));
}
