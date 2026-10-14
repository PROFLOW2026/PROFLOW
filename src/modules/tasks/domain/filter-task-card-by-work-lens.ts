import type { TaskCardData } from '../ui/task-api';
import type { TaskListFilters } from './types';

/** Client-side filter for My Work rows using the same keys as work lens URL params. */
export function filterTaskCardsByWorkLens(
  tasks: readonly TaskCardData[],
  filters: TaskListFilters,
  options: { today?: string } = {},
): TaskCardData[] {
  return tasks.filter((task) => taskMatchesWorkLens(task, filters, options));
}

function taskMatchesWorkLens(
  task: TaskCardData,
  filters: TaskListFilters,
  options: { today?: string },
): boolean {
  if (filters.projectId && task.projectId !== filters.projectId) return false;
  if (filters.noProjectOnly && task.projectId != null) return false;
  if (filters.status && filters.status !== 'all' && task.status !== filters.status) return false;
  if (filters.priority && filters.priority !== 'all' && task.priority !== filters.priority) return false;
  if (filters.blocked && task.status !== 'blocked') return false;

  if (filters.search?.trim()) {
    const term = filters.search.trim().toLowerCase();
    if (!task.title.toLowerCase().includes(term)) return false;
  }

  if (filters.dueAfter && task.dueDate && task.dueDate < filters.dueAfter) return false;
  if (filters.dueBefore && task.dueDate && task.dueDate > filters.dueBefore) return false;

  if (filters.overdue) {
    const today = options.today;
    if (!today || !task.dueDate || task.dueDate >= today) return false;
    if (task.status === 'done' || task.status === 'cancelled') return false;
  }

  if (filters.assigneeOrgMemberId) {
    const hit = task.assignees.some((a) => a.id === filters.assigneeOrgMemberId);
    if (!hit) return false;
  }

  if (filters.assigneeEmployeeId) {
    const hit = task.assignees.some((a) => a.id === filters.assigneeEmployeeId);
    if (!hit) return false;
  }

  return true;
}
