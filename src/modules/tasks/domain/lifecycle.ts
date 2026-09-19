/**
 * Task status lifecycle rules.
 *
 * Valid status transitions and completion/archive rules.
 */

import { DomainRuleError } from '@/shared/errors';
import type { TaskStatus } from './types';

/**
 * Allowed transitions for each status.
 * Any status can transition to 'cancelled'.
 * 'done' and 'cancelled' can be reopened to 'todo'.
 */
const ALLOWED_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ['in_progress', 'in_review', 'blocked', 'done', 'cancelled'],
  in_progress: ['todo', 'in_review', 'blocked', 'done', 'cancelled'],
  in_review: ['in_progress', 'blocked', 'done', 'todo', 'cancelled'],
  blocked: ['todo', 'in_progress', 'in_review', 'cancelled'],
  done: ['todo', 'in_progress', 'cancelled'],
  cancelled: ['todo'],
};

export function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionTask(
  currentStatus: TaskStatus,
  newStatus: TaskStatus,
): { status: TaskStatus; completionDate: string | null } {
  if (!isValidTransition(currentStatus, newStatus)) {
    throw new DomainRuleError(
      `Invalid status transition: ${currentStatus} → ${newStatus}`,
      'tasks.errors.invalidTransition',
      { from: currentStatus, to: newStatus },
    );
  }

  const completionDate =
    newStatus === 'done' ? new Date().toISOString().split('T')[0]! : null;

  return { status: newStatus, completionDate };
}

/**
 * Returns true when the status represents a terminal/final state.
 */
export function isTerminalStatus(status: TaskStatus): boolean {
  return status === 'done' || status === 'cancelled';
}

/**
 * Validates that a task can be archived.
 * Business rule: only archived after completion or cancellation (or explicit override with TASKS_MANAGE_ALL).
 */
export function canArchiveTask(_status: TaskStatus): boolean {
  return true; // Soft-delete allowed regardless of status (admin call)
}

/**
 * Returns the status to apply when re-opening a terminal task.
 */
export function getReopenStatus(_currentStatus: TaskStatus): TaskStatus {
  return 'todo';
}
