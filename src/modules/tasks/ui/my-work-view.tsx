'use client';

/**
 * MyWorkView — Aggregated My Work hub with tab/segment navigation.
 *
 * Lazy-loads one view at a time; tab switches update `?view=` and fetch via server action when needed.
 */

import {
  AlertTriangle,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCheck,
  Clock,
  Eye,
  ListChecks,
  User,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { uwmPrimaryPanelClass, uwmPageHeadingClass, uwmTabBarClass } from '@/shared/ui/uwm-surface-styles';
import { DEFAULT_MY_WORK_VIEW } from '@/modules/tasks/domain/my-work-views';
import type { MyWorkItem, MyWorkViewKey, TaskCardData, TaskDetail } from './task-api';
import { TaskListView } from './task-list-view';
import { TaskDetailSheet } from './task-detail-sheet';

// ---------------------------------------------------------------------------
// View definitions
// ---------------------------------------------------------------------------

interface ViewDef {
  key: MyWorkViewKey;
  labelKey: string;
  icon: React.ReactNode;
  emptyTitleKey: string;
  emptyDescKey: string;
}

const VIEWS: ViewDef[] = [
  {
    key: 'today',
    labelKey: 'myWork.views.today',
    icon: <CalendarCheck2 aria-hidden className="size-4" />,
    emptyTitleKey: 'myWork.empty.today.title',
    emptyDescKey: 'myWork.empty.today.desc',
  },
  {
    key: 'overdue',
    labelKey: 'myWork.views.overdue',
    icon: <AlertTriangle aria-hidden className="size-4" />,
    emptyTitleKey: 'myWork.empty.overdue.title',
    emptyDescKey: 'myWork.empty.overdue.desc',
  },
  {
    key: 'this_week',
    labelKey: 'myWork.views.thisWeek',
    icon: <CalendarDays aria-hidden className="size-4" />,
    emptyTitleKey: 'myWork.empty.thisWeek.title',
    emptyDescKey: 'myWork.empty.thisWeek.desc',
  },
  {
    key: 'upcoming',
    labelKey: 'myWork.views.upcoming',
    icon: <CalendarClock aria-hidden className="size-4" />,
    emptyTitleKey: 'myWork.empty.upcoming.title',
    emptyDescKey: 'myWork.empty.upcoming.desc',
  },
  {
    key: 'waiting',
    labelKey: 'myWork.views.waiting',
    icon: <Clock aria-hidden className="size-4" />,
    emptyTitleKey: 'myWork.empty.waiting.title',
    emptyDescKey: 'myWork.empty.waiting.desc',
  },
  {
    key: 'assigned_to_me',
    labelKey: 'myWork.views.assignedToMe',
    icon: <User aria-hidden className="size-4" />,
    emptyTitleKey: 'myWork.empty.assignedToMe.title',
    emptyDescKey: 'myWork.empty.assignedToMe.desc',
  },
  {
    key: 'following',
    labelKey: 'myWork.views.following',
    icon: <Eye aria-hidden className="size-4" />,
    emptyTitleKey: 'myWork.empty.following.title',
    emptyDescKey: 'myWork.empty.following.desc',
  },
  {
    key: 'completed',
    labelKey: 'myWork.views.completed',
    icon: <CheckCheck aria-hidden className="size-4" />,
    emptyTitleKey: 'myWork.empty.completed.title',
    emptyDescKey: 'myWork.empty.completed.desc',
  },
  {
    key: 'no_project',
    labelKey: 'myWork.views.noProject',
    icon: <Building2 aria-hidden className="size-4" />,
    emptyTitleKey: 'myWork.empty.noProject.title',
    emptyDescKey: 'myWork.empty.noProject.desc',
  },
];

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

function ViewTabBar({
  views,
  current,
  counts,
  onChange,
}: {
  views: ViewDef[];
  current: MyWorkViewKey;
  counts: Partial<Record<MyWorkViewKey, number>>;
  onChange: (key: MyWorkViewKey) => void;
}) {
  const t = useTranslations('tasks');

  return (
    <nav
      aria-label={t('myWork.tabsLabel')}
      className={cn(uwmTabBarClass, 'overflow-x-auto')}
    >
      {views.map((v) => {
        const count = counts[v.key];
        const active = v.key === current;
        return (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v.key)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-semibold transition-colors sm:px-3',
              active
                ? 'bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)] shadow-sm'
                : 'border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] text-[var(--pf-text-primary)] hover:bg-[var(--pf-bg-subtle)]',
            )}
          >
            <span
              className={cn(
                'shrink-0',
                active ? 'text-[var(--pf-text-brand)]' : 'text-[var(--pf-text-muted)]',
              )}
            >
              {v.icon}
            </span>
            <span className="max-w-[5.5rem] truncate text-xs sm:max-w-none sm:text-sm">{t(v.labelKey)}</span>
            {count != null && count > 0 ? (
              <span
                className={cn(
                  'min-w-[1.25rem] rounded-full px-1 py-0.5 text-center text-[0.6rem] font-bold leading-none',
                  v.key === 'overdue'
                    ? 'bg-[var(--pf-status-danger-bg)] text-[var(--pf-status-danger-fg)]'
                    : 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-muted)]',
                )}
              >
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// MyWorkView
// ---------------------------------------------------------------------------

export interface MyWorkViewProps {
  tasksByView: Partial<Record<MyWorkViewKey, MyWorkItem[]>>;
  hasMoreByView?: Partial<Record<MyWorkViewKey, boolean>>;
  /** Active view from URL (`?view=`). */
  activeView: MyWorkViewKey;
  onLoadMore?: (
    view: MyWorkViewKey,
    offset: number,
  ) => Promise<{ tasks: TaskCardData[]; hasMore: boolean }>;
  /** Loads the first page when the user switches to a view not yet fetched. */
  onFetchView?: (view: MyWorkViewKey) => Promise<{ tasks: TaskCardData[]; hasMore: boolean }>;
  onLoadTaskDetail?: (taskId: string) => Promise<TaskDetail | null>;
  onUpdateTask?: (
    taskId: string,
    data: Record<string, unknown>,
  ) => void | Promise<void | { success?: boolean; error?: string }>;
  today?: string;
}

export function MyWorkView({
  tasksByView: initialTasksByView,
  hasMoreByView: initialHasMoreByView = {},
  activeView: activeViewFromUrl,
  onLoadMore,
  onFetchView,
  onLoadTaskDetail,
  onUpdateTask,
  today,
}: MyWorkViewProps) {
  const t = useTranslations('tasks');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tasksByView, setTasksByView] = useState(initialTasksByView);
  const [hasMoreByView, setHasMoreByView] = useState(initialHasMoreByView);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingView, setLoadingView] = useState<MyWorkViewKey | null>(null);
  const [loadedViews, setLoadedViews] = useState<Set<MyWorkViewKey>>(
    () => new Set(Object.keys(initialTasksByView) as MyWorkViewKey[]),
  );
  const activeView = activeViewFromUrl;
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const updateViewInUrl = useCallback(
    (view: MyWorkViewKey) => {
      const params = new URLSearchParams(searchParams.toString());
      if (view === DEFAULT_MY_WORK_VIEW) {
        params.delete('view');
      } else {
        params.set('view', view);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const ensureViewLoaded = useCallback(
    async (view: MyWorkViewKey) => {
      if (loadedViews.has(view) || !onFetchView) return;
      setLoadingView(view);
      try {
        const page = await onFetchView(view);
        setTasksByView((prev) => ({ ...prev, [view]: page.tasks as MyWorkItem[] }));
        setHasMoreByView((prev) => ({ ...prev, [view]: page.hasMore }));
        setLoadedViews((prev) => new Set(prev).add(view));
      } finally {
        setLoadingView(null);
      }
    },
    [loadedViews, onFetchView],
  );

  const counts = Object.fromEntries(
    VIEWS.map((v) => [v.key, tasksByView[v.key]?.length]),
  ) as Partial<Record<MyWorkViewKey, number>>;

  const currentTasks = tasksByView[activeView] ?? [];
  const currentViewDef = VIEWS.find((v) => v.key === activeView)!;

  const handleOpenTask = async (taskId: string) => {
    setSelectedTaskId(taskId);
    setSheetOpen(true);
    if (onLoadTaskDetail) {
      const detail = await onLoadTaskDetail(taskId);
      setTaskDetail(detail);
    }
  };

  const handleUpdateTask = (taskId: string, data: Record<string, unknown>) => {
    void onUpdateTask?.(taskId, data);
  };

  async function handleLoadMore() {
    if (!onLoadMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await onLoadMore(activeView, currentTasks.length);
      setTasksByView((prev) => ({
        ...prev,
        [activeView]: [...(prev[activeView] ?? []), ...(page.tasks as MyWorkItem[])],
      }));
      setHasMoreByView((prev) => ({ ...prev, [activeView]: page.hasMore }));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-col gap-0">
      <ViewTabBar
        views={VIEWS}
        current={activeView}
        counts={counts}
        onChange={(key) => {
          updateViewInUrl(key);
          void ensureViewLoaded(key);
          setSheetOpen(false);
          setSelectedTaskId(null);
        }}
      />

      <div className={cn(uwmPrimaryPanelClass, 'mt-4')}>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[var(--pf-text-muted)]">{currentViewDef.icon}</span>
          <h2 className={uwmPageHeadingClass}>{t(currentViewDef.labelKey)}</h2>
          {currentTasks.length > 0 ? (
            <span className="text-sm font-medium text-[var(--pf-text-muted)]">
              ({currentTasks.length})
            </span>
          ) : null}
        </div>

        {loadingView === activeView ? (
          <p role="status" className="py-8 text-center text-sm text-[var(--pf-text-muted)]">
            {t('loadingTask')}
          </p>
        ) : (
          <TaskListView
            tasks={currentTasks}
            onOpenTask={handleOpenTask}
            showProject
            emptyTitle={t(currentViewDef.emptyTitleKey)}
            emptyDescription={t(currentViewDef.emptyDescKey)}
          />
        )}

        {hasMoreByView[activeView] ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p role="status" className="text-sm text-[var(--pf-text-muted)]">
              {t('list.hasMore')}
            </p>
            {onLoadMore ? (
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
      </div>

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
        onUpdate={handleUpdateTask}
        onRefresh={async (taskId) => {
          if (!onLoadTaskDetail) return;
          const refreshed = await onLoadTaskDetail(taskId);
          if (refreshed) setTaskDetail(refreshed);
        }}
        today={today}
        canPostpone={Boolean(today && onUpdateTask)}
        timeLogBasePath="/workforce/time/new"
      />

      {sheetOpen && selectedTaskId && taskDetail == null ? (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-end pe-4">
          <div className="flex items-center gap-2 rounded-full bg-[var(--pf-bg-elevated)] px-3 py-1.5 text-sm text-[var(--pf-text-muted)] shadow-[var(--pf-shadow-md)]">
            <ListChecks aria-hidden className="size-4 animate-pulse" />
            {t('loadingTask')}
          </div>
        </div>
      ) : null}
    </div>
  );
}
