'use client';

/**
 * Global board grouped by canonical STATUS.
 * Dragging a card updates task status via updateTask. This board has no buckets,
 * so it must not call moveTaskToBucket.
 *
 * Mobile: vertical accordion (one full-width column per status).
 * Desktop: horizontal Kanban columns with drag-and-drop.
 */

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { BoardStatusMoveSelect } from '@/modules/tasks/ui/board-status-move-select';
import { TaskCard } from '@/modules/tasks/ui/task-card';
import { TaskDetailSheet } from '@/modules/tasks/ui/task-detail-sheet';
import { isValidTransition } from '@/modules/tasks/domain/lifecycle';
import { useDesktopBoardDrag } from '@/modules/tasks/ui/use-desktop-board-drag';
import { loadMoreWorkLensTasksAction } from '@/app/[locale]/(app)/work/actions';
import type { TaskCardData, TaskDetail, TaskStatus } from '@/modules/tasks/ui/task-api';

const STATUS_COLUMNS: {
  status: TaskStatus;
  labelKey: string;
  tone: 'neutral' | 'info' | 'pending' | 'danger' | 'success';
}[] = [
  { status: 'todo', labelKey: 'status.todo', tone: 'neutral' },
  { status: 'in_progress', labelKey: 'status.in_progress', tone: 'info' },
  { status: 'in_review', labelKey: 'status.in_review', tone: 'pending' },
  { status: 'blocked', labelKey: 'status.blocked', tone: 'danger' },
  { status: 'done', labelKey: 'status.done', tone: 'success' },
];

export interface GlobalBoardPage {
  tasks: TaskCardData[];
  hasMore: boolean;
  nextOffset: number;
}

export interface GlobalBoardViewProps {
  tasks: TaskCardData[];
  hasMore?: boolean;
  nextOffset?: number;
  workLensFilterQuery?: Record<string, string>;
  loadMoreExcludeCancelled?: boolean;
  onLoadTaskDetail?: (taskId: string) => Promise<TaskDetail | null>;
  onUpdateTask?: (
    taskId: string,
    data: Record<string, unknown>,
  ) => void | Promise<{ error?: string } | void>;
}

export function GlobalBoardView({
  tasks: initialTasks,
  hasMore: initialHasMore = false,
  nextOffset: initialNextOffset = 0,
  workLensFilterQuery,
  loadMoreExcludeCancelled = false,
  onLoadTaskDetail,
  onUpdateTask,
}: GlobalBoardViewProps) {
  const canLoadMore = workLensFilterQuery !== undefined;
  const t = useTranslations('tasks');
  const dragEnabled = useDesktopBoardDrag();
  const [tasks, setTasks] = useState(initialTasks);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStatus, setDropStatus] = useState<TaskStatus | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const movingIds = useRef(new Set<string>());

  const byStatus = new Map<TaskStatus, TaskCardData[]>(
    STATUS_COLUMNS.map((column) => [column.status, []]),
  );
  for (const task of tasks) {
    const column = byStatus.get(task.status);
    if (column) column.push(task);
  }

  const statusMoveOptions = STATUS_COLUMNS.map((column) => ({
    status: column.status,
    label: t(column.labelKey),
  }));

  const firstOpenStatus: TaskStatus =
    STATUS_COLUMNS.find((column) => (byStatus.get(column.status)?.length ?? 0) > 0)?.status ??
    'todo';

  async function moveTask(taskId: string, nextStatus: TaskStatus) {
    if (movingIds.current.has(taskId)) return;
    const current = tasks.find((task) => task.id === taskId);
    if (!current || current.status === nextStatus) return;
    if (!isValidTransition(current.status, nextStatus)) {
      setMoveError(t('errors.invalidTransition'));
      return;
    }

    movingIds.current.add(taskId);
    setMoveError(null);
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? { ...task, status: nextStatus, isBlocked: nextStatus === 'blocked' }
          : task,
      ),
    );

    try {
      const result = await onUpdateTask?.(taskId, { status: nextStatus });
      if (result && 'error' in result && result.error) {
        setTasks((prev) => prev.map((task) => (task.id === taskId ? current : task)));
        setMoveError(result.error);
      }
    } catch (error) {
      setTasks((prev) => prev.map((task) => (task.id === taskId ? current : task)));
      setMoveError(error instanceof Error && error.message ? error.message : t('errors.invalidTransition'));
    } finally {
      movingIds.current.delete(taskId);
    }
  }

  async function handleOpenTask(taskId: string) {
    setSelectedTaskId(taskId);
    setSheetOpen(true);
    if (onLoadTaskDetail) {
      const detail = await onLoadTaskDetail(taskId);
      setTaskDetail(detail);
    }
  }

  async function handleLoadMore() {
    if (!canLoadMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await loadMoreWorkLensTasksAction(nextOffset, workLensFilterQuery ?? {}, {
        excludeCancelled: loadMoreExcludeCancelled,
      });
      setTasks((prev) => {
        const seen = new Set(prev.map((task) => task.id));
        return [...prev, ...page.tasks.filter((task) => !seen.has(task.id))];
      });
      setHasMore(page.hasMore);
      setNextOffset(page.nextOffset);
    } finally {
      setLoadingMore(false);
    }
  }

  function renderColumnTasks(columnTasks: TaskCardData[]) {
    if (columnTasks.length === 0) {
      return (
        <p className="py-2 text-center text-xs text-[var(--pf-text-muted)]">{t('emptyColumn')}</p>
      );
    }

    return (
      <ul className="flex min-w-0 max-w-full flex-col gap-2">
        {columnTasks.map((task) => (
          <li key={task.id} className="min-w-0 max-w-full">
            <TaskCard
              task={task}
              onOpen={handleOpenTask}
              isDragging={draggingId === task.id}
              className="w-full max-w-full"
            />
            {!dragEnabled ? (
              <BoardStatusMoveSelect
                currentStatus={task.status}
                options={statusMoveOptions.filter((option) =>
                  isValidTransition(task.status, option.status),
                )}
                onMove={(next) => void moveTask(task.id, next)}
              />
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      {moveError ? (
        <p role="alert" className="text-sm text-[var(--pf-status-danger-fg)]">
          {moveError}
        </p>
      ) : null}

      <div className="min-w-0 max-w-full">
        {/* Desktop Kanban */}
        <div className="hidden min-w-0 gap-3 overflow-x-auto overscroll-x-contain pb-3 md:flex">
          {STATUS_COLUMNS.map((column) => {
            const columnTasks = byStatus.get(column.status) ?? [];
            return (
              <section
                key={column.status}
                aria-labelledby={`global-status-col-${column.status}`}
                className={`flex w-[min(17rem,80vw)] shrink-0 flex-col gap-2 rounded-xl border bg-[var(--pf-bg-subtle)] p-3 ${
                  dropStatus === column.status
                    ? 'border-[var(--pf-border-brand)]'
                    : 'border-[var(--pf-border-default)]'
                }`}
                onDragOver={(event) => {
                  if (!dragEnabled) return;
                  event.preventDefault();
                  setDropStatus(column.status);
                }}
                onDragLeave={() =>
                  setDropStatus((current) => (current === column.status ? null : current))
                }
                onDrop={(event) => {
                  event.preventDefault();
                  setDropStatus(null);
                  const taskId = event.dataTransfer.getData('taskId');
                  if (taskId) void moveTask(taskId, column.status);
                }}
              >
                <header className="flex items-center justify-between gap-2">
                  <Badge id={`global-status-col-${column.status}`} tone={column.tone} className="text-xs">
                    {t(column.labelKey)}
                  </Badge>
                  <span className="text-xs text-[var(--pf-text-muted)]" aria-hidden>
                    {columnTasks.length}
                  </span>
                </header>

                {columnTasks.length === 0 ? (
                  <p className="py-2 text-center text-xs text-[var(--pf-text-muted)]">{t('emptyColumn')}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {columnTasks.map((task) => (
                      <li
                        key={task.id}
                        draggable={dragEnabled}
                        onDragStart={(event) => {
                          if (!dragEnabled) return;
                          event.dataTransfer.setData('taskId', task.id);
                          event.dataTransfer.effectAllowed = 'move';
                          setDraggingId(task.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                      >
                        <TaskCard task={task} onOpen={handleOpenTask} isDragging={draggingId === task.id} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        {/* Mobile accordion */}
        <div className="flex flex-col gap-2 pb-6 md:hidden">
          {STATUS_COLUMNS.map((column) => {
            const columnTasks = byStatus.get(column.status) ?? [];
            const title = `${t(column.labelKey)} (${columnTasks.length})`;
            return (
              <CollapsibleSection
                key={column.status}
                title={title}
                defaultOpen={column.status === firstOpenStatus}
                className="min-w-0 max-w-full bg-[var(--pf-bg-subtle)]"
              >
                {renderColumnTasks(columnTasks)}
              </CollapsibleSection>
            );
          })}
        </div>
      </div>

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
        onUpdate={(taskId, data) => onUpdateTask?.(taskId, data)}
      />
    </>
  );
}
