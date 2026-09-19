'use client';

/**
 * GlobalBoardView — Client shell for the Global Board page.
 *
 * Groups ALL tasks by canonical STATUS (not bucket).
 * Status columns: Todo | In Progress | In Review | Blocked | Done
 *
 * Architecture rule: global board groups by canonical status — bucket-specific
 * views only appear inside workspace/project board pages.
 *
 * Agent E dependency:
 *   Comments + activity feed slots in TaskDetailSheet — wired when Agent E delivers.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { TaskCard } from '@/modules/tasks/ui/task-card';
import { TaskDetailSheet } from '@/modules/tasks/ui/task-detail-sheet';
import type { TaskCardData, TaskDetail, TaskStatus } from '@/modules/tasks/ui/_task-api-stub';

// ---------------------------------------------------------------------------
// Status column definitions (global board = canonical status grouping)
// ---------------------------------------------------------------------------

const STATUS_COLUMNS: {
  status: TaskStatus;
  labelKey: string;
  tone: 'neutral' | 'info' | 'pending' | 'danger' | 'success';
}[] = [
  { status: 'todo', labelKey: 'status.todo', tone: 'neutral' },
  { status: 'in_progress', labelKey: 'status.inProgress', tone: 'info' },
  { status: 'in_review', labelKey: 'status.inReview', tone: 'pending' },
  { status: 'blocked', labelKey: 'status.blocked', tone: 'danger' },
  { status: 'done', labelKey: 'status.done', tone: 'success' },
];

function StatusColumn({
  status,
  labelKey,
  tone,
  tasks,
  onOpenTask,
}: {
  status: TaskStatus;
  labelKey: string;
  tone: 'neutral' | 'info' | 'pending' | 'danger' | 'success';
  tasks: TaskCardData[];
  onOpenTask: (id: string) => void;
}) {
  const t = useTranslations('tasks');

  return (
    <section
      aria-labelledby={`global-status-col-${status}`}
      className="flex w-[min(17rem,80vw)] shrink-0 flex-col gap-2 rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] p-3"
    >
      <header className="flex items-center justify-between gap-2">
        <Badge id={`global-status-col-${status}`} tone={tone} className="text-xs">
          {t(labelKey)}
        </Badge>
        <span className="text-xs text-[var(--pf-text-muted)]" aria-hidden>
          {tasks.length}
        </span>
      </header>

      {tasks.length === 0 ? (
        <p className="py-2 text-center text-xs text-[var(--pf-text-muted)]">
          {t('emptyColumn')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li key={task.id}>
              <TaskCard task={task} onOpen={onOpenTask} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export interface GlobalBoardViewProps {
  tasks: TaskCardData[];
  /**
   * Called when user clicks a task card. Parent server component provides
   * a bound server action that calls getTaskDetail.
   * TODO: wire to real getTaskDetail server action from Agent A.
   */
  onLoadTaskDetail?: (taskId: string) => Promise<TaskDetail | null>;
  /** TODO: wire to updateTask server action from Agent A */
  onUpdateTask?: (taskId: string, data: Record<string, unknown>) => void;
}

export function GlobalBoardView({ tasks, onLoadTaskDetail, onUpdateTask }: GlobalBoardViewProps) {
  const t = useTranslations('tasks');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Group by canonical status
  const byStatus = new Map<TaskStatus, TaskCardData[]>(
    STATUS_COLUMNS.map((c) => [c.status, []]),
  );
  for (const task of tasks) {
    const arr = byStatus.get(task.status);
    if (arr) arr.push(task);
  }

  const handleOpenTask = async (taskId: string) => {
    setSelectedTaskId(taskId);
    setSheetOpen(true);
    if (onLoadTaskDetail) {
      const detail = await onLoadTaskDetail(taskId);
      setTaskDetail(detail);
    }
  };

  if (tasks.length === 0) {
    return (
      <EmptyState
        title={t('board.empty.title')}
        description={t('board.empty.globalDescription')}
      />
    );
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto overscroll-x-contain pb-3">
        {STATUS_COLUMNS.map((col) => (
          <StatusColumn
            key={col.status}
            status={col.status}
            labelKey={col.labelKey}
            tone={col.tone}
            tasks={byStatus.get(col.status) ?? []}
            onOpenTask={handleOpenTask}
          />
        ))}
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
        onUpdate={(taskId, data) => onUpdateTask?.(taskId, data)}
      />
    </>
  );
}
