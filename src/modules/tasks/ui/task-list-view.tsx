'use client';

/**
 * TaskListView — High-density sortable task list.
 *
 * Sortable by: due date, priority, created.
 * Columns: title, project, status, priority, assignees, due date.
 * Responsive: desktop table | mobile card stack.
 * Click row → opens TaskDetailSheet via onOpenTask callback.
 *
 * Agent A dependency:
 *   TaskCardData type from _task-api-stub.ts
 *   TODO: swap to `import { TaskCardData } from '@/modules/tasks'` when Agent A delivers.
 */

import { AlertCircle, ArrowDown, ArrowUp, Calendar, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { coerceBusinessDate, type BusinessDate } from '@/shared/dates/dates';
import { formatBusinessDateMonthDay } from '@/shared/dates/format';
import { cn } from '@/shared/ui/cn';
import { uwmListPanelClass, uwmListRowClass } from '@/shared/ui/uwm-surface-styles';
import type { TaskCardData, TaskPriority, TaskStatus } from './_task-api-stub';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortField = 'dueDate' | 'priority' | 'createdAt' | 'title';
type SortDir = 'asc' | 'desc';

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

const STATUS_TONE: Record<
  TaskStatus,
  'neutral' | 'info' | 'pending' | 'warning' | 'danger' | 'success'
> = {
  todo: 'neutral',
  in_progress: 'info',
  in_review: 'pending',
  blocked: 'danger',
  done: 'success',
  cancelled: 'neutral',
};

const PRIORITY_TONE: Record<TaskPriority, 'neutral' | 'info' | 'warning' | 'danger'> = {
  none: 'neutral',
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDueBusinessDate(dueDate: string): BusinessDate {
  return coerceBusinessDate(dueDate);
}

function formatDueDateLabel(dueDate: string, locale: string): string {
  return formatBusinessDateMonthDay(parseDueBusinessDate(dueDate), locale);
}

function isTaskOverdue(dueDate: string, status: TaskStatus): boolean {
  if (status === 'done' || status === 'cancelled') return false;
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

function sortTasks(tasks: TaskCardData[], field: SortField, dir: SortDir): TaskCardData[] {
  return [...tasks].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'dueDate':
        cmp =
          (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) -
          (b.dueDate ? new Date(b.dueDate).getTime() : Infinity);
        break;
      case 'priority':
        cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        break;
      case 'createdAt':
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'title':
        cmp = a.title.localeCompare(b.title);
        break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

// ---------------------------------------------------------------------------
// Sort header button
// ---------------------------------------------------------------------------

function SortableHeader({
  field,
  currentField,
  currentDir,
  onSort,
  children,
}: {
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (field: SortField) => void;
  children: React.ReactNode;
}) {
  const active = field === currentField;

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide',
        active
          ? 'text-[var(--pf-text-primary)]'
          : 'text-[var(--pf-text-muted)] hover:text-[var(--pf-text-secondary)]',
      )}
      aria-sort={active ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {children}
      {active ? (
        currentDir === 'asc' ? (
          <ArrowUp aria-hidden className="size-3" />
        ) : (
          <ArrowDown aria-hidden className="size-3" />
        )
      ) : (
        <ChevronsUpDown aria-hidden className="size-3 opacity-40" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function TaskMobileCard({
  task,
  onOpen,
  locale,
}: {
  task: TaskCardData;
  onOpen: (id: string) => void;
  locale: string;
}) {
  const t = useTranslations('tasks');
  const dueDate = task.dueDate;
  const isOverdue = dueDate != null && isTaskOverdue(dueDate, task.status);

  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="flex w-full flex-col gap-1.5 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 text-start hover:border-[var(--pf-border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium">{task.title}</span>
        {task.isBlocked && (
          <AlertCircle aria-label={t('status.blocked')} className="size-4 shrink-0 text-[var(--pf-status-danger-fg)]" />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={STATUS_TONE[task.status]} className="text-[0.6rem]">
          {t(`status.${task.status}`)}
        </Badge>
        <Badge tone={PRIORITY_TONE[task.priority]} className="text-[0.6rem]">
          {t(`priority.${task.priority}`)}
        </Badge>
        {task.projectName && (
          <span className="text-xs text-[var(--pf-text-muted)]">{task.projectName}</span>
        )}
        {dueDate && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs',
              isOverdue
                ? 'font-medium text-[var(--pf-status-danger-fg)]'
                : 'text-[var(--pf-text-muted)]',
            )}
          >
            <Calendar aria-hidden className="size-3" />
            {formatDueDateLabel(dueDate, locale)}
          </span>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// TaskListView
// ---------------------------------------------------------------------------

export interface TaskListViewProps {
  tasks: TaskCardData[];
  /** Called when user clicks a row — parent opens TaskDetailSheet */
  onOpenTask: (taskId: string) => void;
  /** Show project column (true for My Work; false for board-scoped lists) */
  showProject?: boolean;
  /** Optional empty state override */
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

export function TaskListView({
  tasks,
  onOpenTask,
  showProject = true,
  emptyTitle,
  emptyDescription,
  className,
}: TaskListViewProps) {
  const t = useTranslations('tasks');
  const locale = useLocale();
  const [sortField, setSortField] = useState<SortField>('dueDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(
    () => sortTasks(tasks, sortField, sortDir),
    [tasks, sortField, sortDir],
  );

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  if (sorted.length === 0) {
    return (
      <EmptyState
        title={emptyTitle ?? t('list.empty.title')}
        description={emptyDescription ?? t('list.empty.description')}
        className={className}
      />
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Desktop table */}
      <div className={cn('hidden md:block', uwmListPanelClass)}>
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)]">
            <tr>
              <th className="px-4 py-2.5 text-start" scope="col">
                <SortableHeader
                  field="title"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                >
                  {t('list.columns.title')}
                </SortableHeader>
              </th>
              {showProject && (
                <th className="px-4 py-2.5 text-start" scope="col">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-muted)]">
                    {t('list.columns.project')}
                  </span>
                </th>
              )}
              <th className="px-4 py-2.5 text-start" scope="col">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-muted)]">
                  {t('list.columns.status')}
                </span>
              </th>
              <th className="px-4 py-2.5 text-start" scope="col">
                <SortableHeader
                  field="priority"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                >
                  {t('list.columns.priority')}
                </SortableHeader>
              </th>
              <th className="px-4 py-2.5 text-start" scope="col">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-muted)]">
                  {t('list.columns.assignees')}
                </span>
              </th>
              <th className="px-4 py-2.5 text-start" scope="col">
                <SortableHeader
                  field="dueDate"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                >
                  {t('list.columns.dueDate')}
                </SortableHeader>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--pf-border-default)]">
            {sorted.map((task) => {
              const dueDate = task.dueDate;
              const isOverdue = dueDate != null && isTaskOverdue(dueDate, task.status);

              return (
                <tr
                  key={task.id}
                  onClick={() => onOpenTask(task.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenTask(task.id);
                    }
                  }}
                  className={cn(
                    uwmListRowClass,
                    'cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--pf-focus-ring)]',
                  )}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {task.isBlocked && (
                        <AlertCircle
                          aria-label={t('status.blocked')}
                          className="size-3.5 shrink-0 text-[var(--pf-status-danger-fg)]"
                        />
                      )}
                      <span className="font-medium">{task.title}</span>
                    </div>
                  </td>
                  {showProject && (
                    <td className="px-4 py-2.5 text-[var(--pf-text-muted)]">
                      {task.projectName ?? '—'}
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    <Badge tone={STATUS_TONE[task.status]} className="text-xs">
                      {t(`status.${task.status}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={PRIORITY_TONE[task.priority]} className="text-xs">
                      {t(`priority.${task.priority}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {task.assignees.length === 0 ? (
                      <span className="text-xs text-[var(--pf-text-muted)]">
                        {t('unassigned')}
                      </span>
                    ) : (
                      <div className="flex -space-x-1.5 rtl:space-x-reverse">
                        {task.assignees.slice(0, 3).map((a) =>
                          a.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={a.id}
                              src={a.avatarUrl}
                              alt={a.displayName ?? ''}
                              className="size-6 rounded-full border-2 border-[var(--pf-bg-surface)] object-cover"
                            />
                          ) : (
                            <span
                              key={a.id}
                              className="flex size-6 items-center justify-center rounded-full border-2 border-[var(--pf-bg-surface)] bg-[var(--pf-teal-100)] text-[0.625rem] font-semibold uppercase text-[var(--pf-teal-800)]"
                            >
                              {(a.displayName ?? '?')[0]}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {dueDate ? (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-xs',
                          isOverdue
                            ? 'font-semibold text-[var(--pf-status-danger-fg)]'
                            : 'text-[var(--pf-text-muted)]',
                        )}
                      >
                        <Calendar aria-hidden className="size-3" />
                        {formatDueDateLabel(dueDate, locale)}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--pf-text-muted)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card stack */}
      <div className="flex flex-col gap-2 md:hidden">
        {sorted.map((task) => (
          <TaskMobileCard key={task.id} task={task} onOpen={onOpenTask} locale={locale} />
        ))}
      </div>
    </div>
  );
}
