import type { TaskStatus } from './types';

const COMPLETE_STATUSES: ReadonlySet<TaskStatus> = new Set(['done', 'cancelled']);

export function isPredecessorComplete(status: TaskStatus): boolean {
  return COMPLETE_STATUSES.has(status);
}
