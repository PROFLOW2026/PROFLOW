import type { TaskListFilters, TaskListSortField } from './types';

/** Stable cross-lens ordering (due → priority → id). */
export const TASK_LIST_LENS_DEFAULT_SORT: {
  readonly field: TaskListSortField;
  readonly direction: 'asc';
} = {
  field: 'dueDate',
  direction: 'asc',
};

export function resolveTaskListSort(
  filters: Pick<TaskListFilters, 'listOrder' | 'sort'>,
): { field: TaskListSortField; direction: 'asc' | 'desc' } {
  if (filters.listOrder === 'board_sort_key') {
    return { field: 'sortKey', direction: 'asc' };
  }
  if (filters.sort?.field) {
    return {
      field: filters.sort.field,
      direction: filters.sort.direction ?? 'asc',
    };
  }
  return TASK_LIST_LENS_DEFAULT_SORT;
}
