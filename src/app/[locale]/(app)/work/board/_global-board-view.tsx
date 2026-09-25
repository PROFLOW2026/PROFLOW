'use client';

/**
 * Global board grouped by canonical STATUS.
 * Dragging a card updates task status via updateTask. This board has no buckets,
 * so it must not call moveTaskToBucket.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { TaskCard } from '@/modules/tasks/ui/task-card';
import { TaskDetailSheet } from '@/modules/tasks/ui/task-detail-sheet';
import { isValidTransition } from '@/modules/tasks/domain/lifecycle';
import type { TaskCardData, TaskDetail, TaskStatus } from '@/modules/tasks/ui/_task-api-stub';

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

function useDesktopDrag() {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px) and (pointer: fine)');
    const update = () => setEnabled(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return enabled;
}

export interface GlobalBoardPage {
  tasks: TaskCardData[];
  hasMore: boolean;
  nextOffset: number;
}

export interface GlobalBoardViewProps {
  tasks: TaskCardData[];
  hasMore?: boolean;
  nextOffset?: number;
  onLoadTaskDetail?: (taskId: string) => Promise<TaskDetail | null>;
  onUpdateTask?: (
    taskId: string,
    data: Record<string, unknown>,
  ) => void | Promise<{ error?: string } | void>;
  onLoadMore?: (offset: number) => Promise<GlobalBoardPage>;
}

export function GlobalBoardView({
  tasks: initialTasks,
  hasMore: initialHasMore = false,
  nextOffset: initialNextOffset = 0,
  onLoadTaskDetail,
  onUpdateTask,
  onLoadMore,
}: GlobalBoardViewProps) {
  const t = useTranslations('tasks');
  const dragEnabled = useDesktopDrag();
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
    if (!onLoadMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await onLoadMore(nextOffset);
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

  return (
    <>
      {moveError ? (
        <p role="alert" className="text-sm text-[var(--pf-status-danger-fg)]">
          {moveError}
        </p>
      ) : null}

      <div className="flex gap-3 overflow-x-auto overscroll-x-contain pb-3">
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
              onDragLeave={() => setDropStatus((current) => (current === column.status ? null : current))}
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
                      {!dragEnabled ? (
                        <label className="mt-1 block">
                          <span className="sr-only">{t('board.moveToStatus')}</span>
                          <select
                            aria-label={t('board.moveToStatus')}
                            defaultValue=""
                            className="h-9 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 text-xs"
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              const next = event.target.value as TaskStatus;
                              event.target.value = '';
                              if (next) void moveTask(task.id, next);
                            }}
                          >
                            <option value="">{t('board.moveToStatus')}</option>
                            {STATUS_COLUMNS.filter((target) =>
                              isValidTransition(task.status, target.status),
                            ).map((target) => (
                              <option key={target.status} value={target.status}>
                                {t(target.labelKey)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {hasMore ? (
        <div className="flex flex-wrap items-center gap-3">
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
