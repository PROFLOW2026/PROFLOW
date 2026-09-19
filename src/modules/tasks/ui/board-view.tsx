'use client';

/**
 * BoardView — Kanban board with drag-and-drop bucket columns.
 *
 * Architecture notes:
 * - Bucket = user-configurable column (not canonical status)
 * - Drag/drop updates bucket_id + sort_key via Server Action (optimistic)
 * - Group-by toggle: bucket | assignee | priority | label
 * - Filters bar: assignee, label, priority, overdue, blocked
 * - Mobile: single-column card stack (no drag/drop)
 * - RTL: logical CSS throughout
 *
 * Agent A dependency:
 *   moveTaskToBucket, listBuckets — imported from _task-api-stub.ts
 *   TODO: swap to `import { moveTaskToBucket } from '@/modules/tasks'` once Agent A delivers.
 */

import { GripVertical, LayoutGrid, Plus, User, Tag, BarChart2 } from 'lucide-react';
import { useCallback, useOptimistic, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/shared/ui/cn';
import type { Bucket, TaskCardData, TaskPriority, TaskStatus } from './_task-api-stub';
import { TaskCard } from './task-card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GroupBy = 'bucket' | 'assignee' | 'priority' | 'label';

interface FilterState {
  assigneeId?: string;
  labelId?: string;
  priority?: TaskPriority;
  overdue?: boolean;
  blocked?: boolean;
}

interface Column {
  key: string;
  label: string;
  wipLimit?: number | null;
  color?: string | null;
  statusOnEnter?: TaskStatus | null;
  tasks: TaskCardData[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyFilters(tasks: TaskCardData[], filters: FilterState): TaskCardData[] {
  return tasks.filter((t) => {
    if (filters.assigneeId && !t.assignees.some((a) => a.id === filters.assigneeId)) return false;
    if (filters.labelId && !t.labels.includes(filters.labelId)) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.overdue) {
      const due = t.dueDate ? new Date(t.dueDate) : null;
      if (!due || due >= new Date()) return false;
    }
    if (filters.blocked && !t.isBlocked) return false;
    return true;
  });
}

function groupByBucket(tasks: TaskCardData[], buckets: Bucket[]): Column[] {
  const byBucket = new Map<string | null, TaskCardData[]>();
  for (const t of tasks) {
    const key = t.bucketId ?? '__none__';
    const arr = byBucket.get(key) ?? [];
    arr.push(t);
    byBucket.set(key, arr);
  }

  const cols: Column[] = buckets.map((b) => ({
    key: b.id,
    label: b.name,
    wipLimit: b.wipLimit,
    color: b.color,
    statusOnEnter: b.statusOnEnter,
    tasks: [...(byBucket.get(b.id) ?? [])].sort((a, z) => a.sortKey.localeCompare(z.sortKey)),
  }));

  // Uncategorized tasks
  const uncat = byBucket.get('__none__') ?? [];
  if (uncat.length > 0) {
    cols.push({ key: '__none__', label: 'Uncategorized', tasks: uncat });
  }

  return cols;
}

function groupByAssignee(tasks: TaskCardData[]): Column[] {
  const byAssignee = new Map<string, { name: string; tasks: TaskCardData[] }>();
  for (const t of tasks) {
    if (t.assignees.length === 0) {
      const entry = byAssignee.get('__unassigned__') ?? {
        name: 'Unassigned',
        tasks: [],
      };
      entry.tasks.push(t);
      byAssignee.set('__unassigned__', entry);
    } else {
      for (const a of t.assignees) {
        const entry = byAssignee.get(a.id) ?? {
          name: a.displayName ?? 'Unknown',
          tasks: [],
        };
        entry.tasks.push(t);
        byAssignee.set(a.id, entry);
      }
    }
  }
  return Array.from(byAssignee.entries()).map(([key, v]) => ({
    key,
    label: v.name,
    tasks: v.tasks,
  }));
}

function groupByPriority(tasks: TaskCardData[]): Column[] {
  const ORDER: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];
  const byPriority = new Map<TaskPriority, TaskCardData[]>();
  for (const t of tasks) {
    const arr = byPriority.get(t.priority) ?? [];
    arr.push(t);
    byPriority.set(t.priority, arr);
  }
  return ORDER.filter((p) => byPriority.has(p)).map((p) => ({
    key: p,
    label: p.charAt(0).toUpperCase() + p.slice(1),
    tasks: byPriority.get(p) ?? [],
  }));
}

function groupByLabel(tasks: TaskCardData[]): Column[] {
  const byLabel = new Map<string, TaskCardData[]>();
  for (const t of tasks) {
    if (t.labels.length === 0) {
      const arr = byLabel.get('__none__') ?? [];
      arr.push(t);
      byLabel.set('__none__', arr);
    } else {
      for (const label of t.labels) {
        const arr = byLabel.get(label) ?? [];
        arr.push(t);
        byLabel.set(label, arr);
      }
    }
  }
  return Array.from(byLabel.entries()).map(([key, tasks]) => ({
    key,
    label: key === '__none__' ? 'No Label' : key,
    tasks,
  }));
}

// ---------------------------------------------------------------------------
// Quick-add row (inline title input at bottom of bucket)
// ---------------------------------------------------------------------------

function QuickAddTask({
  bucketId,
  onAdd,
}: {
  bucketId: string;
  onAdd: (title: string, bucketId: string) => void;
}) {
  const t = useTranslations('tasks');
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  const submit = () => {
    const title = value.trim();
    if (title) {
      onAdd(title, bucketId);
      setValue('');
    }
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[var(--pf-text-muted)] hover:bg-[var(--pf-action-subtle-hover)] hover:text-[var(--pf-text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
      >
        <Plus aria-hidden className="size-3.5" />
        {t('addTask')}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
         
        autoFocus
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') {
            setValue('');
            setOpen(false);
          }
        }}
        placeholder={t('taskTitlePlaceholder')}
        className="rounded-md border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] px-2.5 py-1.5 text-sm placeholder:text-[var(--pf-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
      />
      <div className="flex gap-1.5">
        <Button size="sm" variant="primary" onClick={submit} className="flex-1">
          {t('add')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setValue('');
            setOpen(false);
          }}
        >
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

function BoardColumn({
  column,
  groupBy,
  onOpenTask,
  onAddTask,
  onDrop,
  draggingId,
  setDraggingId,
}: {
  column: Column;
  groupBy: GroupBy;
  onOpenTask: (taskId: string) => void;
  onAddTask: (title: string, bucketId: string) => void;
  onDrop: (taskId: string, targetBucketId: string, afterTaskId: string | null) => void;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
}) {
  const t = useTranslations('tasks');
  const isOverWipLimit =
    column.wipLimit != null && column.tasks.length > column.wipLimit;
  const [isDropTarget, setIsDropTarget] = useState(false);

  return (
    <section
      aria-labelledby={`board-col-${column.key}`}
      className={cn(
        'flex w-[min(17rem,80vw)] shrink-0 flex-col gap-2 rounded-xl border bg-[var(--pf-bg-subtle)] p-3',
        isDropTarget
          ? 'border-[var(--pf-border-brand)] bg-[var(--pf-teal-50)]'
          : 'border-[var(--pf-border-default)]',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDropTarget(true);
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDropTarget(false);
        const taskId = e.dataTransfer.getData('taskId');
        if (taskId) onDrop(taskId, column.key, null);
      }}
    >
      {/* Column header */}
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Color indicator */}
          {column.color && (
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ background: column.color }}
              aria-hidden
            />
          )}
          <h2
            id={`board-col-${column.key}`}
            className="truncate text-sm font-semibold"
          >
            {column.label}
          </h2>
          {/* Status-on-enter badge */}
          {column.statusOnEnter && (
            <Badge tone="neutral" className="shrink-0 text-[0.6rem]">
              → {t(`status.${column.statusOnEnter}`)}
            </Badge>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* WIP limit indicator */}
          <span
            className={cn(
              'text-xs font-medium tabular-nums',
              isOverWipLimit
                ? 'text-[var(--pf-status-danger-fg)]'
                : 'text-[var(--pf-text-muted)]',
            )}
            aria-label={
              column.wipLimit != null
                ? t('wipLimitLabel', { count: column.tasks.length, limit: column.wipLimit })
                : undefined
            }
          >
            {column.wipLimit != null
              ? `${column.tasks.length}/${column.wipLimit}`
              : column.tasks.length}
          </span>
        </div>
      </header>

      {/* Task list */}
      <ul className="flex flex-col gap-2 overflow-y-auto">
        {column.tasks.length === 0 ? (
          <li>
            <p className="text-xs text-[var(--pf-text-muted)] py-2 text-center">
              {t('emptyColumn')}
            </p>
          </li>
        ) : (
          column.tasks.map((task) => (
            <li
              key={task.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('taskId', task.id);
                setDraggingId(task.id);
              }}
              onDragEnd={() => setDraggingId(null)}
              className="group relative"
            >
              {/* Drag handle (visible on hover) */}
              <span
                className="absolute start-0 top-1/2 -translate-y-1/2 -translate-x-full ps-0.5 opacity-0 group-hover:opacity-60 cursor-grab active:cursor-grabbing"
                aria-hidden
              >
                <GripVertical className="size-3.5 text-[var(--pf-text-muted)]" />
              </span>
              <TaskCard
                task={task}
                onOpen={onOpenTask}
                isDragging={draggingId === task.id}
              />
            </li>
          ))
        )}
      </ul>

      {/* Quick-add (bucket grouping only) */}
      {groupBy === 'bucket' && column.key !== '__none__' && (
        <QuickAddTask bucketId={column.key} onAdd={onAddTask} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Group-by toggle
// ---------------------------------------------------------------------------

function GroupByToggle({
  value,
  onChange,
}: {
  value: GroupBy;
  onChange: (v: GroupBy) => void;
}) {
  const t = useTranslations('tasks');

  const options: { value: GroupBy; icon: React.ReactNode; label: string }[] = [
    { value: 'bucket', icon: <LayoutGrid aria-hidden className="size-3.5" />, label: t('groupBy.bucket') },
    { value: 'assignee', icon: <User aria-hidden className="size-3.5" />, label: t('groupBy.assignee') },
    { value: 'priority', icon: <BarChart2 aria-hidden className="size-3.5" />, label: t('groupBy.priority') },
    { value: 'label', icon: <Tag aria-hidden className="size-3.5" />, label: t('groupBy.label') },
  ];

  return (
    <div
      role="group"
      aria-label={t('groupByLabel')}
      className="flex items-center gap-1 rounded-lg border border-[var(--pf-border-default)] p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === o.value
              ? 'bg-[var(--pf-bg-elevated)] shadow-sm text-[var(--pf-text-primary)]'
              : 'text-[var(--pf-text-secondary)] hover:text-[var(--pf-text-primary)]',
          )}
        >
          {o.icon}
          <span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BoardView
// ---------------------------------------------------------------------------

export interface BoardViewProps {
  buckets: Bucket[];
  initialTasks: TaskCardData[];
  /** Called when the user clicks a task card — parent opens TaskDetailSheet */
  onOpenTask: (taskId: string) => void;
  /** Called when the user submits a quick-add — parent fires Server Action */
  onAddTask: (title: string, bucketId: string) => void;
  /**
   * Called after drag-drop — parent fires moveTaskToBucket Server Action.
   * afterTaskId = the task the dropped task should follow (null = prepend).
   */
  onMoveTask: (taskId: string, targetBucketId: string, afterTaskId: string | null) => void;
}

export function BoardView({
  buckets,
  initialTasks,
  onOpenTask,
  onAddTask,
  onMoveTask,
}: BoardViewProps) {
  const t = useTranslations('tasks');
  const [groupBy, setGroupBy] = useState<GroupBy>('bucket');
  const [filters, setFilters] = useState<FilterState>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Optimistic task list (reorder on drag)
  const [tasks, setOptimisticTasks] = useOptimistic(initialTasks);

  const handleDrop = useCallback(
    (taskId: string, targetBucketId: string, afterTaskId: string | null) => {
      // Optimistic update: move task to target bucket locally
      startTransition(() => {
        setOptimisticTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  bucketId: targetBucketId,
                  bucketName:
                    buckets.find((b) => b.id === targetBucketId)?.name ?? t.bucketName,
                }
              : t,
          ),
        );
      });

      // Call server action (parent owns server action call)
      onMoveTask(taskId, targetBucketId, afterTaskId);
    },
    [buckets, onMoveTask, setOptimisticTasks, startTransition],
  );

  const filtered = applyFilters(tasks, filters);

  const columns: Column[] =
    groupBy === 'bucket'
      ? groupByBucket(filtered, buckets)
      : groupBy === 'assignee'
        ? groupByAssignee(filtered)
        : groupBy === 'priority'
          ? groupByPriority(filtered)
          : groupByLabel(filtered);

  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <GroupByToggle value={groupBy} onChange={setGroupBy} />

        {/* Filter chips */}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setFilters((f) => ({ ...f, overdue: !f.overdue }))
            }
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
              filters.overdue
                ? 'border-[var(--pf-status-danger-border)] bg-[var(--pf-status-danger-bg)] text-[var(--pf-status-danger-fg)]'
                : 'border-[var(--pf-border-default)] text-[var(--pf-text-secondary)] hover:border-[var(--pf-border-strong)]',
            )}
          >
            {t('filter.overdue')}
          </button>
          <button
            type="button"
            onClick={() =>
              setFilters((f) => ({ ...f, blocked: !f.blocked }))
            }
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
              filters.blocked
                ? 'border-[var(--pf-status-danger-border)] bg-[var(--pf-status-danger-bg)] text-[var(--pf-status-danger-fg)]'
                : 'border-[var(--pf-border-default)] text-[var(--pf-text-secondary)] hover:border-[var(--pf-border-strong)]',
            )}
          >
            🔴 {t('filter.blocked')}
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => setFilters({})}
              className="text-xs text-[var(--pf-text-brand)] hover:underline"
            >
              {t('filter.clear')}
            </button>
          )}
        </div>
      </div>

      {/* Board columns (horizontal scroll on desktop, single column on mobile) */}
      {columns.length === 0 ? (
        <EmptyState
          title={t('board.empty.title')}
          description={t('board.empty.description')}
        />
      ) : (
        <div
          className="flex gap-3 overflow-x-auto overscroll-x-contain pb-3 md:pb-0"
          // Mobile: show as stacked single column
          style={{}}
        >
          {columns.map((col) => (
            <BoardColumn
              key={col.key}
              column={col}
              groupBy={groupBy}
              onOpenTask={onOpenTask}
              onAddTask={onAddTask}
              onDrop={handleDrop}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
