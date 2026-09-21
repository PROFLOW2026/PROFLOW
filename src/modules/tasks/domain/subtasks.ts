import { DomainRuleError } from '@/shared/errors';
import type { Task } from './types';

/**
 * Subtasks are limited to two levels: parent → child only (no grandchildren).
 */
export function assertMaxSubtaskDepth(parentTask: Task | null): void {
  if (!parentTask) return;
  if (parentTask.parentTaskId) {
    throw new DomainRuleError(
      'Subtasks cannot be nested more than one level deep',
      'tasks.errors.maxSubtaskDepth',
    );
  }
}

export function assertSameWorkspaceContext(
  parentTask: Task,
  workspaceId: string,
  projectId: string | null | undefined,
): void {
  if (parentTask.workspaceId !== workspaceId) {
    throw new DomainRuleError(
      'Subtask must belong to the same workspace as its parent',
      'tasks.errors.subtaskWorkspaceMismatch',
    );
  }

  const normalizedProjectId = projectId ?? null;
  const parentProjectId = parentTask.projectId ?? null;
  if (normalizedProjectId !== parentProjectId) {
    throw new DomainRuleError(
      'Subtask must belong to the same project context as its parent',
      'tasks.errors.subtaskProjectMismatch',
    );
  }
}
