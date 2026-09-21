'use client';

import { AlertCircle, Calendar, GripVertical } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { coerceBusinessDate } from '@/shared/dates';
import { formatBusinessDateMonthDay } from '@/shared/dates/format';
import { cn } from '@/shared/ui/cn';
import { uwmListPanelClass, uwmListRowClass, uwmTabBarClass } from '@/shared/ui/uwm-surface-styles';
import type { TaskCardData, TaskPriority, TaskStatus } from './_task-api-stub';

type TimelineGroupBy = 'date' | 'project' | 'status';

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

interface TimelineGroup {
  key: string;
  label: string;
  tasks: TaskCardData[];
}

function timelineSortKey(task: TaskCardData): string {
  return task.dueDate ?? task.startDate ?? '9999-12-31';
}

function groupTasks(tasks: TaskCardData[], groupBy: TimelineGroupBy, t: (key: string) => string): TimelineGroup[] {
  const map = new Map<string, TimelineGroup>();

  for (const task of tasks) {
    let key: string;
    let label: string;

    switch (groupBy) {
      case 'project':
        key = task.projectId ?? '__none__';
        label = task.projectName ?? t('timeline.noProject');
        break;
      case 'status':
        key = task.status;
        label = t(`status.${task.status}`);
        break;
      case 'date':
      default: {
        const raw = task.dueDate ?? task.startDate;
        if (!raw) {
          key = '__undated__';
          label = t('timeline.undated');
        } else {
          key = raw;
          label = raw;
        }
        break;
      }
    }

    const existing = map.get(key);
    if (existing) {
      existing.tasks.push(task);
    } else {
      map.set(key, { key, label, tasks: [task] });
    }
  }

  const groups = Array.from(map.values());
  for (const group of groups) {
    group.tasks.sort((a, b) => timelineSortKey(a).localeCompare(timelineSortKey(b)));
  }

  if (groupBy === 'date') {
    return groups.sort((a, b) => {
      if (a.key === '__undated__') return 1;
      if (b.key === '__undated__') return -1;
      return a.key.localeCompare(b.key);
    });
  }

  return groups.sort((a, b) => a.label.localeCompare(b.label));
}

export interface TaskTimelineViewProps {
  tasks: TaskCardData[];
  onOpenTask: (taskId: string) => void;
  onUpdateDueDate?: (taskId: string, dueDate: string | null) => Promise<void>;
  showProject?: boolean;
  className?: string;
}

export function TaskTimelineView({
  tasks,
  onOpenTask,
  onUpdateDueDate,
  showProject = true,
  className,
}: TaskTimelineViewProps) {
  const t = useTranslations('tasks');
  const locale = useLocale();
  const [groupBy, setGroupBy] = useState<TimelineGroupBy>('date');
  const [isPending, startTransition] = useTransition();

  const groups = useMemo(() => groupTasks(tasks, groupBy, t), [tasks, groupBy, t]);

  if (tasks.length === 0) {
    return (
      <EmptyState
        title={t('timeline.empty.title')}
        description={t('timeline.empty.description')}
        className={className}
      />
    );
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <nav aria-label={t('timeline.groupByLabel')} className={cn(uwmTabBarClass, 'w-fit')}>
        {(['date', 'project', 'status'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setGroupBy(mode)}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-semibold transition-colors',
              groupBy === mode
                ? 'bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)]'
                : 'border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] text-[var(--pf-text-primary)] hover:bg-[var(--pf-bg-subtle)]',
            )}
          >
            {t(`timeline.groupBy.${mode}`)}
          </button>
        ))}
      </nav>

      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <section key={group.key} className={uwmListPanelClass}>
            <h3 className="border-b border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] px-4 py-2 text-sm font-semibold text-[var(--pf-text-primary)]">
              {groupBy === 'date' && group.key !== '__undated__'
                ? formatBusinessDateMonthDay(coerceBusinessDate(group.label), locale)
                : group.label}
              <span className="ms-2 text-xs font-normal text-[var(--pf-text-muted)]">
                ({group.tasks.length})
              </span>
            </h3>
            <ul>
              {group.tasks.map((task) => (
                <li
                  key={task.id}
                  className={cn(
                    uwmListRowClass,
                    'flex flex-wrap items-center gap-3 px-4 py-3',
                    isPending && 'opacity-70',
                  )}
                >
                  <GripVertical aria-hidden className="size-4 shrink-0 text-[var(--pf-text-muted)]" />
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="min-w-0 flex-1 text-start focus-visible:outline-2 focus-visible:outline-[var(--pf-focus-ring)]"
                  >
                    <div className="flex items-center gap-2">
                      {(task.isBlocked || task.status === 'blocked') && (
                        <AlertCircle
                          aria-label={t('status.blocked')}
                          className="size-4 shrink-0 text-[var(--pf-status-danger-fg)]"
                        />
                      )}
                      <span className="font-medium">{task.title}</span>
                    </div>
                    {showProject && task.projectName && (
                      <p className="mt-0.5 text-xs text-[var(--pf-text-muted)]">{task.projectName}</p>
                    )}
                  </button>
                  <Badge tone={STATUS_TONE[task.status]} className="text-xs">
                    {t(`status.${task.status}`)}
                  </Badge>
                  <Badge tone={PRIORITY_TONE[task.priority]} className="text-xs">
                    {t(`priority.${task.priority}`)}
                  </Badge>
                  {onUpdateDueDate ? (
                    <label className="inline-flex items-center gap-1 text-xs text-[var(--pf-text-secondary)]">
                      <Calendar aria-hidden className="size-3" />
                      <input
                        type="date"
                        defaultValue={task.dueDate ?? ''}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const value = e.target.value || null;
                          startTransition(async () => {
                            await onUpdateDueDate(task.id, value);
                          });
                        }}
                        className="rounded border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-1 py-0.5 text-xs"
                      />
                    </label>
                  ) : task.dueDate ? (
                    <time
                      dateTime={task.dueDate}
                      className="inline-flex items-center gap-1 text-xs text-[var(--pf-text-muted)]"
                    >
                      <Calendar aria-hidden className="size-3" />
                      {formatBusinessDateMonthDay(coerceBusinessDate(task.dueDate), locale)}
                    </time>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
