'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  addDays,
  businessDate,
  coerceBusinessDate,
  startOfMonth,
  startOfWeek,
  type BusinessDate,
} from '@/shared/dates';
import { formatBusinessDateMonthDay } from '@/shared/dates/format';
import { intlDateTimeFormat } from '@/shared/i18n/intl-locale';
import { rtlFlipClassName } from '@/shared/i18n/ltr-island';
import { cn } from '@/shared/ui/cn';
import { uwmPrimaryPanelClass } from '@/shared/ui/uwm-surface-styles';
import type { TaskCardData, TaskStatus } from './task-api';

type CalendarMode = 'month' | 'week';

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

function taskAnchorDate(task: TaskCardData): BusinessDate | null {
  const raw = task.dueDate ?? task.startDate ?? null;
  if (!raw) return null;
  try {
    return coerceBusinessDate(raw);
  } catch {
    return null;
  }
}

function datesInRange(start: BusinessDate, end: BusinessDate): BusinessDate[] {
  const out: BusinessDate[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

function monthGridDays(anchor: BusinessDate): BusinessDate[] {
  const monthStart = startOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, 0);
  const monthEnd = addDays(startOfMonth(addDays(monthStart, 32)), -1);
  const gridEnd = addDays(startOfWeek(addDays(monthEnd, 7), 0), -1);
  return datesInRange(gridStart, gridEnd);
}

function weekDays(anchor: BusinessDate): BusinessDate[] {
  const weekStart = startOfWeek(anchor, 0);
  return datesInRange(weekStart, addDays(weekStart, 6));
}

export interface TaskCalendarViewProps {
  tasks: TaskCardData[];
  unscheduledTasks?: TaskCardData[];
  unscheduledHasMore?: boolean;
  onLoadMoreUnscheduled?: () => Promise<void>;
  today: string;
  onOpenTask: (taskId: string) => void;
  onScheduleTask?: (taskId: string, dueDate: BusinessDate) => void | Promise<void>;
  canScheduleTasks?: boolean;
  monthKey?: string;
  onMonthKeyChange?: (monthKey: string) => void;
  loadingMoreUnscheduled?: boolean;
  showProject?: boolean;
  className?: string;
}

export function TaskCalendarView({
  tasks,
  unscheduledTasks = [],
  unscheduledHasMore = false,
  onLoadMoreUnscheduled,
  today,
  onOpenTask,
  onScheduleTask,
  canScheduleTasks = false,
  monthKey,
  onMonthKeyChange,
  loadingMoreUnscheduled = false,
  showProject = true,
  className,
}: TaskCalendarViewProps) {
  const t = useTranslations('tasks');
  const locale = useLocale();
  const [mode, setMode] = useState<CalendarMode>('month');
  const [anchor, setAnchor] = useState<BusinessDate>(() =>
    monthKey ? businessDate(`${monthKey}-01`) : businessDate(today),
  );

  useEffect(() => {
    if (monthKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync calendar anchor when month query changes
      setAnchor(businessDate(`${monthKey}-01`));
    }
  }, [monthKey]);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [mobilePickTaskId, setMobilePickTaskId] = useState<string | null>(null);
  const [loadingUnscheduled, startUnscheduled] = useTransition();
  const [isPending, startSchedule] = useTransition();

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskCardData[]>();
    for (const task of tasks) {
      const date = taskAnchorDate(task);
      if (!date) continue;
      const bucket = map.get(date) ?? [];
      bucket.push(task);
      map.set(date, bucket);
    }
    for (const [, bucket] of map) {
      bucket.sort((a, b) => a.title.localeCompare(b.title));
    }
    return map;
  }, [tasks]);

  const visibleDays = mode === 'month' ? monthGridDays(anchor) : weekDays(anchor);
  const monthStart = startOfMonth(anchor);

  const datedTaskCount = useMemo(
    () => tasks.filter((task) => taskAnchorDate(task) != null).length,
    [tasks],
  );

  const showEmpty = datedTaskCount === 0 && unscheduledTasks.length === 0;

  function shiftPeriod(delta: number) {
    if (mode === 'month' && onMonthKeyChange) {
      const next = addDays(startOfMonth(anchor), delta > 0 ? 32 : -1);
      onMonthKeyChange(next.slice(0, 7));
      return;
    }
    setAnchor((current) => addDays(current, mode === 'month' ? delta * 30 : delta * 7));
  }

  function goToToday() {
    const todayAnchor = businessDate(today);
    if (mode === 'month' && onMonthKeyChange) {
      onMonthKeyChange(todayAnchor.slice(0, 7));
    } else {
      setAnchor(todayAnchor);
    }
  }

  async function dropOnDay(day: BusinessDate) {
    if (!canScheduleTasks || !onScheduleTask || !dragTaskId) return;
    const taskId = dragTaskId;
    setDragTaskId(null);
    startSchedule(async () => {
      await onScheduleTask(taskId, day);
    });
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {showEmpty ? (
        <EmptyState
          title={t('calendar.empty.title')}
          description={t('calendar.empty.description')}
        />
      ) : null}

      {!showEmpty ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => shiftPeriod(-1)}>
                <ChevronLeft aria-hidden className={rtlFlipClassName('size-4')} />
                <span className="sr-only">{t('calendar.previous')}</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={goToToday}
              >
                {t('calendar.today')}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => shiftPeriod(1)}>
                <ChevronRight aria-hidden className={rtlFlipClassName('size-4')} />
                <span className="sr-only">{t('calendar.next')}</span>
              </Button>
              <h2 className="text-sm font-semibold text-[var(--pf-text-primary)]">
                {intlDateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
                  new Date(`${anchor}T12:00:00`),
                )}
              </h2>
            </div>

            <div className="inline-flex rounded-md border border-[var(--pf-border-default)] p-0.5">
              <button
                type="button"
                onClick={() => setMode('month')}
                className={cn(
                  'rounded px-3 py-1.5 text-sm font-medium',
                  mode === 'month'
                    ? 'bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)]'
                    : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-subtle)]',
                )}
              >
                {t('calendar.monthView')}
              </button>
              <button
                type="button"
                onClick={() => setMode('week')}
                className={cn(
                  'rounded px-3 py-1.5 text-sm font-medium',
                  mode === 'week'
                    ? 'bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)]'
                    : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-subtle)]',
                )}
              >
                {t('calendar.weekView')}
              </button>
            </div>
          </div>

          <div
            className={cn(
              uwmPrimaryPanelClass,
              'overflow-x-auto',
              isPending && 'opacity-80',
              mode === 'month'
                ? 'grid grid-cols-7 gap-px bg-[var(--pf-border-default)]'
                : 'grid grid-cols-1 gap-2 sm:grid-cols-7',
            )}
          >
            {visibleDays.map((day) => {
              const dayTasks = tasksByDate.get(day) ?? [];
              const isToday = day === today;
              const inCurrentMonth = day.slice(0, 7) === monthStart.slice(0, 7);

              return (
                <div
                  key={day}
                  onDragOver={
                    canScheduleTasks
                      ? (event) => {
                          event.preventDefault();
                        }
                      : undefined
                  }
                  onDrop={
                    canScheduleTasks
                      ? (event) => {
                          event.preventDefault();
                          void dropOnDay(day);
                        }
                      : undefined
                  }
                  className={cn(
                    'min-h-[6.5rem] bg-[var(--pf-bg-surface)] p-2',
                    mode === 'week' && 'rounded-lg border border-[var(--pf-border-default)]',
                    mode === 'month' && !inCurrentMonth && 'opacity-50',
                    canScheduleTasks && dragTaskId && 'ring-1 ring-inset ring-[var(--pf-focus-ring)]/30',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <time
                      dateTime={day}
                      className={cn(
                        'text-xs font-semibold',
                        isToday
                          ? 'rounded-full bg-[var(--pf-action-primary)] px-1.5 py-0.5 text-[var(--pf-action-primary-fg)]'
                          : 'text-[var(--pf-text-secondary)]',
                      )}
                    >
                      {formatBusinessDateMonthDay(day, locale)}
                    </time>
                    {dayTasks.length > 0 && (
                      <span className="text-[0.625rem] text-[var(--pf-text-muted)]">
                        {dayTasks.length}
                      </span>
                    )}
                  </div>
                  <ul className="flex flex-col gap-1">
                    {dayTasks.slice(0, mode === 'month' ? 3 : 8).map((task) => (
                      <li key={task.id}>
                        <button
                          type="button"
                          draggable={canScheduleTasks}
                          onDragStart={
                            canScheduleTasks
                              ? () => {
                                  setDragTaskId(task.id);
                                }
                              : undefined
                          }
                          onDragEnd={() => setDragTaskId(null)}
                          onClick={() => onOpenTask(task.id)}
                          className="flex w-full flex-col gap-0.5 rounded border border-[var(--pf-border-default)] px-1.5 py-1 text-start hover:border-[var(--pf-border-strong)] focus-visible:outline-2 focus-visible:outline-[var(--pf-focus-ring)]"
                        >
                          <span className="truncate text-xs font-medium">{task.title}</span>
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge tone={STATUS_TONE[task.status]} className="text-[0.55rem]">
                              {t(`status.${task.status}`)}
                            </Badge>
                            {showProject && task.projectName && (
                              <span className="truncate text-[0.6rem] text-[var(--pf-text-muted)]">
                                {task.projectName}
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                    {dayTasks.length > (mode === 'month' ? 3 : 8) && (
                      <li className="text-[0.625rem] text-[var(--pf-text-muted)]">
                        {t('calendar.moreTasks', {
                          count: dayTasks.length - (mode === 'month' ? 3 : 8),
                        })}
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {canScheduleTasks && unscheduledTasks.length > 0 ? (
        <section
          className={cn(
            uwmPrimaryPanelClass,
            'fixed inset-x-0 bottom-0 z-30 max-h-[45vh] overflow-y-auto border-t border-[var(--pf-border-default)] p-4 shadow-[var(--pf-shadow-lg)] sm:static sm:max-h-none sm:shadow-none',
          )}
          aria-label={t('calendar.unscheduled.title')}
        >
          <h3 className="mb-2 text-sm font-semibold">{t('calendar.unscheduled.title')}</h3>
          <p className="mb-3 text-xs text-[var(--pf-text-muted)]">{t('calendar.unscheduled.hint')}</p>
          <ul className="flex flex-col gap-2">
            {unscheduledTasks.map((task) => (
              <li key={task.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    draggable
                    onDragStart={() => setDragTaskId(task.id)}
                    onDragEnd={() => setDragTaskId(null)}
                    onClick={() => onOpenTask(task.id)}
                    className="min-w-0 flex-1 rounded border border-[var(--pf-border-default)] px-2 py-1.5 text-start text-sm hover:bg-[var(--pf-bg-subtle)]"
                  >
                    {task.title}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-[var(--pf-text-link)] sm:hidden"
                    onClick={() =>
                      setMobilePickTaskId((current) => (current === task.id ? null : task.id))
                    }
                  >
                    {t('calendar.unscheduled.pickDate')}
                  </button>
                </div>
                {mobilePickTaskId === task.id && onScheduleTask ? (
                  <input
                    type="date"
                    className="mt-2 w-full rounded border border-[var(--pf-border-default)] px-2 py-1 text-sm"
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) return;
                      startSchedule(async () => {
                        await onScheduleTask(task.id, businessDate(value));
                        setMobilePickTaskId(null);
                      });
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {unscheduledHasMore && onLoadMoreUnscheduled ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3"
              disabled={loadingUnscheduled || loadingMoreUnscheduled}
              onClick={() => startUnscheduled(() => onLoadMoreUnscheduled())}
            >
              {t('list.loadMore')}
            </Button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
