'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/shared/ui/cn';
import { uwmFilterPanelClass } from '@/shared/ui/uwm-surface-styles';
import type { TaskListFilters, TaskPriority, TaskStatus } from './_task-api-stub';
import type { TaskCardData } from './_task-api-stub';

export interface TaskFilterBarState {
  status: TaskStatus | 'all';
  priority: TaskPriority | 'all';
  search: string;
  overdue: boolean;
  blocked: boolean;
  noProjectOnly: boolean;
}

export const DEFAULT_TASK_FILTER_STATE: TaskFilterBarState = {
  status: 'all',
  priority: 'all',
  search: '',
  overdue: false,
  blocked: false,
  noProjectOnly: false,
};

const STATUS_OPTIONS: Array<TaskStatus | 'all'> = [
  'all',
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled',
];

const PRIORITY_OPTIONS: Array<TaskPriority | 'all'> = [
  'all',
  'urgent',
  'high',
  'medium',
  'low',
  'none',
];

export function toTaskListFilters(state: TaskFilterBarState): TaskListFilters {
  return {
    ...(state.status !== 'all' ? { status: state.status } : {}),
    ...(state.priority !== 'all' ? { priority: state.priority } : {}),
    ...(state.search.trim() ? { search: state.search.trim() } : {}),
  };
}

export function applyClientTaskFilters(
  tasks: TaskCardData[],
  state: TaskFilterBarState,
  today: string,
): TaskCardData[] {
  const query = state.search.trim().toLowerCase();

  return tasks.filter((task) => {
    if (state.status !== 'all' && task.status !== state.status) return false;
    if (state.priority !== 'all' && task.priority !== state.priority) return false;
    if (state.overdue) {
      if (!task.dueDate || task.dueDate >= today) return false;
      if (task.status === 'done' || task.status === 'cancelled') return false;
    }
    if (state.blocked && !task.isBlocked && task.status !== 'blocked') return false;
    if (state.noProjectOnly && task.projectId) return false;
    if (query) {
      const haystack = [task.title, task.projectName ?? '', task.clientName ?? ''].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function TaskFiltersBar({
  value,
  onChange,
  className,
}: {
  value: TaskFilterBarState;
  onChange: (next: TaskFilterBarState) => void;
  className?: string;
}) {
  const t = useTranslations('tasks');

  const selectClass =
    'h-9 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 text-sm text-[var(--pf-text-primary)]';

  return (
    <div className={cn(uwmFilterPanelClass, 'flex flex-wrap items-center gap-2', className)}>
      <label className="sr-only" htmlFor="task-filter-search">
        {t('filters.search')}
      </label>
      <input
        id="task-filter-search"
        type="search"
        value={value.search}
        onChange={(e) => onChange({ ...value, search: e.target.value })}
        placeholder={t('filters.searchPlaceholder')}
        className={cn(selectClass, 'min-w-[10rem] flex-1 sm:max-w-xs')}
      />

      <select
        aria-label={t('filters.status')}
        value={value.status}
        onChange={(e) =>
          onChange({ ...value, status: e.target.value as TaskFilterBarState['status'] })
        }
        className={selectClass}
      >
        {STATUS_OPTIONS.map((status) => (
          <option key={status} value={status}>
            {status === 'all' ? t('filters.allStatuses') : t(`status.${status}`)}
          </option>
        ))}
      </select>

      <select
        aria-label={t('filters.priority')}
        value={value.priority}
        onChange={(e) =>
          onChange({ ...value, priority: e.target.value as TaskFilterBarState['priority'] })
        }
        className={selectClass}
      >
        {PRIORITY_OPTIONS.map((priority) => (
          <option key={priority} value={priority}>
            {priority === 'all' ? t('filters.allPriorities') : t(`priority.${priority}`)}
          </option>
        ))}
      </select>

      <label className="inline-flex items-center gap-1.5 text-sm text-[var(--pf-text-secondary)]">
        <input
          type="checkbox"
          checked={value.overdue}
          onChange={(e) => onChange({ ...value, overdue: e.target.checked })}
          className="size-4 rounded border-[var(--pf-border-default)] accent-[var(--pf-action-primary)]"
        />
        {t('filters.overdueOnly')}
      </label>

      <label className="inline-flex items-center gap-1.5 text-sm text-[var(--pf-text-secondary)]">
        <input
          type="checkbox"
          checked={value.blocked}
          onChange={(e) => onChange({ ...value, blocked: e.target.checked })}
          className="size-4 rounded border-[var(--pf-border-default)] accent-[var(--pf-action-primary)]"
        />
        {t('filters.blockedOnly')}
      </label>

      <label className="inline-flex items-center gap-1.5 text-sm text-[var(--pf-text-secondary)]">
        <input
          type="checkbox"
          checked={value.noProjectOnly}
          onChange={(e) => onChange({ ...value, noProjectOnly: e.target.checked })}
          className="size-4 rounded border-[var(--pf-border-default)] accent-[var(--pf-action-primary)]"
        />
        {t('filters.noProjectOnly')}
      </label>
    </div>
  );
}
