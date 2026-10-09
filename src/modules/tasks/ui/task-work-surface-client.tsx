'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { TaskCalendarView } from './task-calendar-view';
import { TaskDetailSheet } from './task-detail-sheet';
import {
  TaskFiltersBar,
  applyClientTaskFilters,
  DEFAULT_TASK_FILTER_STATE,
  type TaskFilterBarState,
} from './task-filters-bar';
import { TaskTimelineView } from './task-timeline-view';
import type { TaskCardData, TaskDetail } from './task-api';
import {
  loadMoreAccessibleTasksAction,
  loadMoreWorkLensTasksAction,
  type WorkActionState,
} from '@/app/[locale]/(app)/work/actions';
import { TASK_LIST_MAX_LIMIT } from '@/modules/tasks/domain/list-window';

export interface TaskWorkSurfaceClientProps {
  tasks: TaskCardData[];
  today: string;
  viewMode: 'calendar' | 'timeline';
  showProject?: boolean;
  timelineDateEdit?: boolean;
  hasMore?: boolean;
  /** When true, filters come from the URL on the server; hide the local filter bar. */
  urlBackedFilters?: boolean;
  /** Work hub lenses: URL filter snapshot for paginated server actions (no inline RSC callbacks). */
  workLensFilterQuery?: Record<string, string>;
  loadMoreExcludeCancelled?: boolean;
  /** Project calendar/timeline: paginate within one project. */
  projectId?: string;
  getTaskDetail: (taskId: string) => Promise<TaskDetail | null>;
  updateTask: (taskId: string, data: Record<string, unknown>) => Promise<WorkActionState>;
}

export function TaskWorkSurfaceClient({
  tasks,
  today,
  viewMode,
  showProject = true,
  timelineDateEdit = false,
  hasMore: initialHasMore = false,
  urlBackedFilters = false,
  workLensFilterQuery,
  loadMoreExcludeCancelled = false,
  projectId,
  getTaskDetail,
  updateTask,
}: TaskWorkSurfaceClientProps) {
  const canLoadMore = Boolean(projectId ?? workLensFilterQuery !== undefined);
  const t = useTranslations('tasks');
  const [filters, setFilters] = useState<TaskFilterBarState>(DEFAULT_TASK_FILTER_STATE);
  const useLocalFilters = !urlBackedFilters;
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [extraTasks, setExtraTasks] = useState<TaskCardData[]>([]);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);

  const allTasks = useMemo(() => [...tasks, ...extraTasks], [tasks, extraTasks]);

  const filteredTasks = useMemo(
    () => (useLocalFilters ? applyClientTaskFilters(allTasks, filters, today) : allTasks),
    [allTasks, filters, today, useLocalFilters],
  );

  async function handleLoadMore() {
    if (!canLoadMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = projectId
        ? await loadMoreAccessibleTasksAction({
            offset: allTasks.length,
            projectId,
            limit: TASK_LIST_MAX_LIMIT,
          })
        : await loadMoreWorkLensTasksAction(allTasks.length, workLensFilterQuery ?? {}, {
            excludeCancelled: loadMoreExcludeCancelled,
          });
      setExtraTasks((prev) => [...prev, ...page.tasks]);
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  const handleOpenTask = async (taskId: string) => {
    setSelectedTaskId(taskId);
    setSheetOpen(true);
    const detail = await getTaskDetail(taskId);
    setTaskDetail(detail);
  };

  const handleUpdate = async (taskId: string, data: Record<string, unknown>) => {
    const result = await updateTask(taskId, data);
    const refreshed = await getTaskDetail(taskId);
    if (refreshed) setTaskDetail(refreshed);
    return result;
  };

  const handleUpdateDueDate = timelineDateEdit
    ? async (taskId: string, dueDate: string | null) => {
        await updateTask(taskId, { dueDate });
      }
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      {useLocalFilters ? <TaskFiltersBar value={filters} onChange={setFilters} /> : null}

      {hasMore ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-[var(--pf-text-muted)]">
            {t('list.hasMore')}
          </p>
          {canLoadMore ? (
            <button
              type="button"
              onClick={() => void handleLoadMore()}
              disabled={loadingMore}
              className="rounded-md border border-[var(--pf-border-default)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--pf-bg-subtle)] disabled:opacity-60"
            >
              {t('list.loadMore')}
            </button>
          ) : null}
        </div>
      ) : null}

      {viewMode === 'calendar' ? (
        <TaskCalendarView
          tasks={filteredTasks}
          today={today}
          onOpenTask={handleOpenTask}
          showProject={showProject}
        />
      ) : (
        <TaskTimelineView
          tasks={filteredTasks}
          onOpenTask={handleOpenTask}
          onUpdateDueDate={handleUpdateDueDate}
          showProject={showProject}
        />
      )}

      <TaskDetailSheet
        task={selectedTaskId != null && taskDetail?.id === selectedTaskId ? taskDetail : null}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            setSelectedTaskId(null);
            setTaskDetail(null);
          }
        }}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
