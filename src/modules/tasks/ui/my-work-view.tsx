'use client';

/**
 * MyWorkView — Aggregated My Work hub with tab/segment navigation.
 *
 * Views: Today | Overdue | This Week | Upcoming | Waiting | Assigned to Me | Following | Completed
 * Each view shows tasks from across all projects/workspaces/boards.
 *
 * Agent A dependency:
 *   MyWorkItem, MyWorkViewKey — from _task-api-stub.ts
 *   TODO: swap to `import { MyWorkItem, MyWorkViewKey } from '@/modules/tasks'` when Agent A delivers.
 */

import {
  AlertTriangle,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCheck,
  Clock,
  Eye,
  ListChecks,
  User,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/ui/cn';
import { uwmPrimaryPanelClass, uwmPageHeadingClass, uwmTabBarClass } from '@/shared/ui/uwm-surface-styles';
import type { MyWorkItem, MyWorkViewKey } from './_task-api-stub';
import { TaskListView } from './task-list-view';
import { TaskDetailSheet } from './task-detail-sheet';
import type { TaskDetail } from './_task-api-stub';

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
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold transition-colors',
              active
                ? 'bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)] shadow-sm'
                : 'border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] text-[var(--pf-text-primary)] hover:bg-[var(--pf-bg-subtle)]',
            )}
          >
            <span className={cn('shrink-0', active ? 'text-[var(--pf-text-brand)]' : 'text-[var(--pf-text-muted)] group-hover:text-[var(--pf-text-secondary)]')}>
              {v.icon}
            </span>
            <span className="hidden sm:inline">{t(v.labelKey)}</span>
            {/* Badge for non-zero counts (especially overdue) */}
            {count != null && count > 0 && (
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
            )}
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
  /**
   * Tasks pre-fetched from Server Component, keyed by view.
   * Agent A's getMyWork is called per-view server-side; results passed here.
   * TODO: When Agent A delivers, server page calls getMyWork for each view and passes results.
   */
  tasksByView: Partial<Record<MyWorkViewKey, MyWorkItem[]>>;
  /**
   * Loads task detail on demand (called when user clicks a task).
   * TODO: wire to getTaskDetail Server Action once Agent A delivers.
   */
  onLoadTaskDetail?: (taskId: string) => Promise<TaskDetail | null>;
  /**
   * Called when user updates a task field in the detail sheet.
   * TODO: wire to updateTask Server Action once Agent A delivers.
   */
  onUpdateTask?: (
    taskId: string,
    data: Record<string, unknown>,
  ) => void | Promise<unknown>;
  /** Initial active view (from URL search param) */
  defaultView?: MyWorkViewKey;
}

export function MyWorkView({
  tasksByView,
  onLoadTaskDetail,
  onUpdateTask,
  defaultView = 'today',
}: MyWorkViewProps) {
  const t = useTranslations('tasks');
  const [activeView, setActiveView] = useState<MyWorkViewKey>(defaultView);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Count badges per view
  const counts = Object.fromEntries(
    VIEWS.map((v) => [v.key, (tasksByView[v.key] ?? []).length]),
  ) as Record<MyWorkViewKey, number>;

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
    onUpdateTask?.(taskId, data);
  };

  return (
    <div className="flex flex-col gap-0">
      {/* Tab bar */}
      <ViewTabBar
        views={VIEWS}
        current={activeView}
        counts={counts}
        onChange={(key) => {
          setActiveView(key);
          setSheetOpen(false);
          setSelectedTaskId(null);
        }}
      />

      {/* Task list for active view */}
      <div className={cn(uwmPrimaryPanelClass, 'mt-4')}>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[var(--pf-text-muted)]">{currentViewDef.icon}</span>
          <h2 className={uwmPageHeadingClass}>{t(currentViewDef.labelKey)}</h2>
          {currentTasks.length > 0 && (
            <span className="text-sm font-medium text-[var(--pf-text-muted)]">
              ({currentTasks.length})
            </span>
          )}
        </div>

        <TaskListView
          tasks={currentTasks}
          onOpenTask={handleOpenTask}
          showProject
          emptyTitle={t(currentViewDef.emptyTitleKey)}
          emptyDescription={t(currentViewDef.emptyDescKey)}
        />
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
      />

      {/* Loading indicator when task detail not yet fetched */}
      {sheetOpen && selectedTaskId && taskDetail == null && (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-end pe-4">
          <div className="flex items-center gap-2 rounded-full bg-[var(--pf-bg-elevated)] px-3 py-1.5 shadow-[var(--pf-shadow-md)] text-sm text-[var(--pf-text-muted)]">
            <ListChecks aria-hidden className="size-4 animate-pulse" />
            {t('loadingTask')}
          </div>
        </div>
      )}
    </div>
  );
}
