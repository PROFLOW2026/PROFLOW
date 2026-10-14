import { insertBetween, prependBefore } from '@/modules/tasks/domain/lexorank';
import { isValidTransition } from '@/modules/tasks/domain/lifecycle';
import type { TaskPriority, TaskStatus } from './task-api';

export type BoardGroupBy = 'bucket' | 'assignee' | 'priority' | 'label';

export type BoardGroupDropKind = 'move' | 'reassign' | 'priority' | 'disabled';

/** Which server action bucket / assignee / priority drag should invoke. */
export function resolveBoardGroupDropKind(groupBy: BoardGroupBy): BoardGroupDropKind {
  if (groupBy === 'bucket') return 'move';
  if (groupBy === 'assignee') return 'reassign';
  if (groupBy === 'priority') return 'priority';
  return 'disabled';
}

/**
 * Given column order excluding the dragged card, returns the task id the moved card
 * should follow (`null` = prepend at top of column).
 *
 * `insertBeforeTaskId` — drop on a card's top edge, or mobile bucket pick (append when null).
 */
export function computeAfterTaskIdForInsert(
  orderedTaskIds: readonly string[],
  draggedTaskId: string,
  insertBeforeTaskId: string | null,
): string | null {
  const withoutDragged = orderedTaskIds.filter((id) => id !== draggedTaskId);
  if (insertBeforeTaskId === null) {
    return withoutDragged.length === 0 ? null : withoutDragged[withoutDragged.length - 1]!;
  }
  const idx = withoutDragged.indexOf(insertBeforeTaskId);
  if (idx <= 0) return null;
  return withoutDragged[idx - 1]!;
}

export function parsePriorityColumnKey(key: string): TaskPriority | null {
  const values: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];
  return values.includes(key as TaskPriority) ? (key as TaskPriority) : null;
}

export function parseAssigneeColumnKey(key: string): string | null {
  if (key === '__unassigned__') return null;
  return key;
}

/**
 * Mirrors `moveTaskToBucket` / `applyTaskStatusChange` — only apply bucket `statusOnEnter`
 * when the lifecycle allows the transition.
 */
export function resolveStatusOnBucketEnter(
  currentStatus: TaskStatus,
  statusOnEnter: TaskStatus | null | undefined,
): TaskStatus | undefined {
  if (!statusOnEnter || statusOnEnter === currentStatus) return undefined;
  if (isValidTransition(currentStatus, statusOnEnter)) return statusOnEnter;
  return undefined;
}

export type SortKeyTaskRef = { readonly id: string; readonly sortKey: string };

/** Optimistic lexorank for a card landing after `afterTaskId` in `columnTasks` (excludes dragged). */
export function computeProvisionalSortKey(
  columnTasks: readonly SortKeyTaskRef[],
  afterTaskId: string | null,
): string {
  const sorted = [...columnTasks].sort((a, z) => a.sortKey.localeCompare(z.sortKey));
  if (sorted.length === 0) return 'M00000000';
  if (afterTaskId === null) {
    return prependBefore(sorted[0]!.sortKey);
  }
  const afterIdx = sorted.findIndex((t) => t.id === afterTaskId);
  if (afterIdx < 0) return sorted[sorted.length - 1]!.sortKey + 'M';
  const after = sorted[afterIdx]!;
  const before = sorted[afterIdx + 1];
  if (!before) return after.sortKey + 'M';
  return insertBetween(after.sortKey, before.sortKey);
}
