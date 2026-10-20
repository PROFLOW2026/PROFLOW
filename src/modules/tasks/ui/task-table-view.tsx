'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/shared/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/shared/ui/cn';
import { uwmListPanelClass, uwmListRowClass } from '@/shared/ui/uwm-surface-styles';
import { BULK_TASK_UPDATE_MAX } from '../domain/bulk-update';
import type { TaskCardData, TaskDetail, TaskPriority, TaskStatus } from './task-api';
import { TaskDetailSheet } from './task-detail-sheet';
import { useTaskShortcuts } from './use-task-shortcuts';

const COLUMN_STORAGE_KEY = 'projectflow.work-table.columns.v1';

type ColumnId =
  | 'title'
  | 'project'
  | 'status'
  | 'priority'
  | 'assignees'
  | 'startDate'
  | 'dueDate'
  | 'effort';

const DEFAULT_COLUMNS: ColumnId[] = [
  'title',
  'project',
  'status',
  'priority',
  'assignees',
  'startDate',
  'dueDate',
  'effort',
];

const STATUS_VALUES: TaskStatus[] = [
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled',
];

const PRIORITY_VALUES: TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'none'];

const INLINE_SELECT =
  'max-w-full rounded border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-1.5 py-1 text-xs';

function readStoredColumns(): ColumnId[] {
  if (typeof window === 'undefined') return DEFAULT_COLUMNS;
  try {
    const raw = window.localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return DEFAULT_COLUMNS;
    const parsed = JSON.parse(raw) as ColumnId[];
    return parsed.length > 0 ? parsed : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

export interface TaskTableViewProps {
  tasks: TaskCardData[];
  hasMore?: boolean;
  onLoadMore?: () => Promise<void>;
  onLoadTaskDetail?: (taskId: string) => Promise<TaskDetail | null>;
  onUpdateTask?: (
    taskId: string,
    data: Record<string, unknown>,
  ) => void | Promise<void | { success?: boolean; error?: string }>;
  onBulkUpdate?: (
    taskIds: string[],
    patch: Record<string, unknown>,
  ) => Promise<{ updated: number; failed: readonly { id: string; reason: string }[] }>;
  today?: string;
  canAssign?: boolean;
  canArchive?: boolean;
  /** When true, bulk edit is hidden (archived-only lens). */
  archivedView?: boolean;
}

export function TaskTableView({
  tasks,
  hasMore = false,
  onLoadMore,
  onLoadTaskDetail,
  onUpdateTask,
  onBulkUpdate,
  onTaskPatched,
  today,
  canAssign = false,
  canArchive = false,
  archivedView = false,
}: TaskTableViewProps & {
  onTaskPatched?: (taskId: string, patch: Partial<TaskCardData>) => void;
}) {
  const t = useTranslations('tasks');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeTask, setActiveTask] = useState<TaskDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(() => readStoredColumns());
  const [isPending, startTransition] = useTransition();

  const selectedIds = useMemo(() => [...selected], [selected]);

  const toggleSort = useCallback(
    (field: string) => {
      const currentField = searchParams.get('sortField');
      const currentDir = searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc';
      const nextDir = currentField === field && currentDir === 'asc' ? 'desc' : 'asc';
      const params = new URLSearchParams(searchParams.toString());
      params.set('sortField', field);
      params.set('sortDir', nextDir);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const openTask = useCallback(
    async (taskId: string) => {
      if (!onLoadTaskDetail) return;
      const detail = await onLoadTaskDetail(taskId);
      if (detail) {
        setActiveTask(detail);
        setSheetOpen(true);
      }
    },
    [onLoadTaskDetail],
  );

  useTaskShortcuts(
    {
      onClose: () => setSheetOpen(false),
      onEditSelected: () => {
        const first = selectedIds[0];
        if (first) void openTask(first);
      },
    },
    true,
  );

  const toggleColumn = (column: ColumnId) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(column) ? prev.filter((c) => c !== column) : [...prev, column];
      window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyBulk = (patch: Record<string, unknown>) => {
    if (!onBulkUpdate || selectedIds.length === 0) return;
    if (selectedIds.length > BULK_TASK_UPDATE_MAX) {
      setBulkMessage(t('table.bulkLimit', { max: BULK_TASK_UPDATE_MAX }));
      return;
    }
    startTransition(async () => {
      const result = await onBulkUpdate(selectedIds, patch);
      setBulkMessage(
        t('table.bulkResult', { updated: result.updated, failed: result.failed.length }),
      );
      setSelected(new Set());
    });
  };

  const patchTaskLocal = (taskId: string, patch: Partial<TaskCardData>) => {
    onTaskPatched?.(taskId, patch);
  };

  if (tasks.length === 0) {
    return (
      <EmptyState title={t('list.empty.title')} description={t('list.empty.description')} />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase text-[var(--pf-text-muted)]">
          {t('table.columnsLabel')}
        </span>
        {DEFAULT_COLUMNS.map((column) => (
          <label key={column} className="inline-flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={visibleColumns.includes(column)}
              onChange={() => toggleColumn(column)}
            />
            {t(`table.columns.${column}`)}
          </label>
        ))}
      </div>

      {selectedIds.length > 0 && onBulkUpdate && !archivedView ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] p-2">
          <span className="text-sm font-medium">{t('table.selected', { count: selectedIds.length })}</span>
          <select
            className={INLINE_SELECT}
            defaultValue=""
            onChange={(e) => {
              const status = e.target.value as TaskStatus;
              if (status) applyBulk({ status });
              e.target.value = '';
            }}
          >
            <option value="">{t('table.bulkStatus')}</option>
            {STATUS_VALUES.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </select>
          <select
            className={INLINE_SELECT}
            defaultValue=""
            onChange={(e) => {
              const priority = e.target.value as TaskPriority;
              if (priority) applyBulk({ priority });
              e.target.value = '';
            }}
          >
            <option value="">{t('table.bulkPriority')}</option>
            {PRIORITY_VALUES.map((priority) => (
              <option key={priority} value={priority}>
                {t(`priority.${priority}`)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {bulkMessage ? (
        <p className="text-sm text-[var(--pf-text-secondary)]" role="status">
          {bulkMessage}
        </p>
      ) : null}

      <div className={cn(uwmListPanelClass, 'hidden md:block')}>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] text-start text-xs uppercase text-[var(--pf-text-muted)]">
              <th className="w-10 px-2 py-2">
                <span className="sr-only">{t('table.select')}</span>
              </th>
              {visibleColumns.includes('title') ? (
                <th className="px-3 py-2">
                  <button type="button" className="font-semibold" onClick={() => toggleSort('title')}>
                    {t('list.columns.title')}
                  </button>
                </th>
              ) : null}
              {visibleColumns.includes('project') ? (
                <th className="px-3 py-2">{t('list.columns.project')}</th>
              ) : null}
              {visibleColumns.includes('status') ? (
                <th className="px-3 py-2">
                  <button type="button" className="font-semibold" onClick={() => toggleSort('status')}>
                    {t('list.columns.status')}
                  </button>
                </th>
              ) : null}
              {visibleColumns.includes('priority') ? (
                <th className="px-3 py-2">
                  <button type="button" className="font-semibold" onClick={() => toggleSort('priority')}>
                    {t('list.columns.priority')}
                  </button>
                </th>
              ) : null}
              {visibleColumns.includes('assignees') ? (
                <th className="px-3 py-2">{t('list.columns.assignees')}</th>
              ) : null}
              {visibleColumns.includes('startDate') ? (
                <th className="px-3 py-2">
                  <button type="button" className="font-semibold" onClick={() => toggleSort('startDate')}>
                    {t('task.startDate')}
                  </button>
                </th>
              ) : null}
              {visibleColumns.includes('dueDate') ? (
                <th className="px-3 py-2">
                  <button type="button" className="font-semibold" onClick={() => toggleSort('dueDate')}>
                    {t('list.columns.dueDate')}
                  </button>
                </th>
              ) : null}
              {visibleColumns.includes('effort') ? (
                <th className="px-3 py-2">{t('task.estimatedEffort')}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className={cn(uwmListRowClass, isPending && 'opacity-70')}>
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(task.id)}
                    onChange={() => toggleRow(task.id)}
                    aria-label={t('table.selectTask', { title: task.title })}
                  />
                </td>
                {visibleColumns.includes('title') ? (
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="font-medium text-[var(--pf-text-brand)] hover:underline"
                      onClick={() => void openTask(task.id)}
                    >
                      {task.title}
                    </button>
                  </td>
                ) : null}
                {visibleColumns.includes('project') ? (
                  <td className="px-3 py-2 text-[var(--pf-text-secondary)]">
                    {task.projectName ?? t('list.notAvailable')}
                  </td>
                ) : null}
                {visibleColumns.includes('status') ? (
                  <td className="px-3 py-2">
                    {onUpdateTask && !archivedView ? (
                      <select
                        className={INLINE_SELECT}
                        value={task.status}
                        onChange={(e) => {
                          const status = e.target.value as TaskStatus;
                          startTransition(async () => {
                            await onUpdateTask(task.id, { status });
                            patchTaskLocal(task.id, { status });
                          });
                        }}
                      >
                        {STATUS_VALUES.map((status) => (
                          <option key={status} value={status}>
                            {t(`status.${status}`)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge tone="neutral">{t(`status.${task.status}`)}</Badge>
                    )}
                  </td>
                ) : null}
                {visibleColumns.includes('priority') ? (
                  <td className="px-3 py-2">
                    {onUpdateTask && !archivedView ? (
                      <select
                        className={INLINE_SELECT}
                        value={task.priority}
                        onChange={(e) => {
                          const priority = e.target.value as TaskPriority;
                          startTransition(async () => {
                            await onUpdateTask(task.id, { priority });
                            patchTaskLocal(task.id, { priority });
                          });
                        }}
                      >
                        {PRIORITY_VALUES.map((priority) => (
                          <option key={priority} value={priority}>
                            {t(`priority.${priority}`)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      t(`priority.${task.priority}`)
                    )}
                  </td>
                ) : null}
                {visibleColumns.includes('assignees') ? (
                  <td className="px-3 py-2 text-xs text-[var(--pf-text-secondary)]">
                    {task.assignees.map((a) => a.displayName).filter(Boolean).join(', ') ||
                      t('list.notAvailable')}
                  </td>
                ) : null}
                {visibleColumns.includes('startDate') ? (
                  <td className="px-3 py-2">
                    {onUpdateTask && !archivedView ? (
                      <input
                        type="date"
                        className={INLINE_SELECT}
                        defaultValue={task.startDate ?? ''}
                        onBlur={(e) => {
                          const startDate = e.target.value || null;
                          startTransition(async () => {
                            await onUpdateTask(task.id, { startDate });
                            patchTaskLocal(task.id, { startDate });
                          });
                        }}
                      />
                    ) : (
                      task.startDate ?? t('list.notAvailable')
                    )}
                  </td>
                ) : null}
                {visibleColumns.includes('dueDate') ? (
                  <td className="px-3 py-2">
                    {onUpdateTask && !archivedView ? (
                      <input
                        type="date"
                        className={INLINE_SELECT}
                        defaultValue={task.dueDate ?? ''}
                        onBlur={(e) => {
                          const dueDate = e.target.value || null;
                          startTransition(async () => {
                            await onUpdateTask(task.id, { dueDate });
                            patchTaskLocal(task.id, { dueDate });
                          });
                        }}
                      />
                    ) : (
                      task.dueDate ?? t('list.notAvailable')
                    )}
                  </td>
                ) : null}
                {visibleColumns.includes('effort') ? (
                  <td className="px-3 py-2">
                    {onUpdateTask && !archivedView ? (
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        className={cn(INLINE_SELECT, 'w-20')}
                        defaultValue={
                          task.estimatedEffortMinutes != null
                            ? task.estimatedEffortMinutes / 60
                            : ''
                        }
                        onBlur={(e) => {
                          const hours = e.target.value.trim();
                          const estimatedEffortMinutes =
                            hours === '' ? null : Math.round(Number(hours) * 60);
                          startTransition(async () => {
                            await onUpdateTask(task.id, { estimatedEffortMinutes });
                            patchTaskLocal(task.id, { estimatedEffortMinutes });
                          });
                        }}
                      />
                    ) : (
                      task.estimatedEffortMinutes != null
                        ? `${task.estimatedEffortMinutes / 60}h`
                        : t('list.notAvailable')
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {tasks.map((task) => (
          <li key={task.id} className={cn(uwmListRowClass, 'rounded-lg border p-3')}>
            <button type="button" className="text-start font-medium" onClick={() => void openTask(task.id)}>
              {task.title}
            </button>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--pf-text-muted)]">
              <span>{t(`status.${task.status}`)}</span>
              {task.dueDate ? <span>{task.dueDate}</span> : null}
            </div>
          </li>
        ))}
      </ul>

      {hasMore && onLoadMore ? (
        <Button
          type="button"
          variant="secondary"
          disabled={loadingMore}
          onClick={() => {
            setLoadingMore(true);
            void onLoadMore().finally(() => setLoadingMore(false));
          }}
        >
          {t('list.loadMore')}
        </Button>
      ) : null}

      {activeTask && onUpdateTask ? (
        <TaskDetailSheet
          task={activeTask}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          onUpdate={onUpdateTask}
          onRefresh={async (taskId) => {
            if (!onLoadTaskDetail) return;
            const detail = await onLoadTaskDetail(taskId);
            if (detail) setActiveTask(detail);
          }}
          today={today}
          canAssign={canAssign}
          canArchive={canArchive}
          onTaskArchived={() => {
            setSheetOpen(false);
            setActiveTask(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
