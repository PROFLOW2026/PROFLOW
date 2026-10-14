import 'server-only';

import { AuthorizationError, DomainRuleError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import type { TaskPriority, TaskStatus, UpdateTaskInput } from '../domain/types';
import { assertCanAccessTask } from './assert-task-access';
import { updateTask } from './update-task';

import { BULK_TASK_UPDATE_MAX } from '../domain/bulk-update';

export { BULK_TASK_UPDATE_MAX };

export interface BulkTaskUpdatePatch {
  readonly status?: TaskStatus;
  readonly priority?: TaskPriority;
  readonly dueDate?: string | null;
  readonly assigneeOrgMemberId?: string | null;
}

export interface BulkTaskUpdateFailure {
  readonly id: string;
  readonly reason: string;
}

export interface BulkTaskUpdateResult {
  readonly updated: number;
  readonly failed: readonly BulkTaskUpdateFailure[];
}

export async function bulkUpdateTasks(
  context: OrgContext,
  taskIds: readonly string[],
  patch: BulkTaskUpdatePatch,
): Promise<BulkTaskUpdateResult> {
  if (taskIds.length > BULK_TASK_UPDATE_MAX) {
    throw new DomainRuleError('Bulk update limit exceeded', 'tasks.table.bulkLimit');
  }

  const updatePayload: UpdateTaskInput = {
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
  };

  let updated = 0;
  const failed: BulkTaskUpdateFailure[] = [];

  for (const id of taskIds) {
    try {
      await assertCanAccessTask(context, id);
      if (patch.assigneeOrgMemberId !== undefined) {
        const { syncTaskAssignees } = await import('./sync-task-assignees');
        const keys =
          patch.assigneeOrgMemberId == null
            ? []
            : [`m:${patch.assigneeOrgMemberId}`];
        await syncTaskAssignees(context, id, { assigneeKeys: keys });
      }
      if (Object.keys(updatePayload).length > 0) {
        await updateTask(context, id, updatePayload);
      }
      updated += 1;
    } catch (error) {
      const reason =
        error instanceof AuthorizationError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Update failed';
      failed.push({ id, reason });
    }
  }

  return { updated, failed };
}
