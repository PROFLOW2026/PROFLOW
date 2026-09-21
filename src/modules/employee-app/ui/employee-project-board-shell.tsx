'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { BoardView } from '@/modules/tasks/ui/board-view';
import type { Bucket, TaskCardData, TaskDetail, TaskStatus } from '@/modules/tasks/ui/_task-api-stub';
import { Link } from '@/shared/i18n/navigation';
import { employeePrimaryButtonClass } from '@/modules/employee-app/ui/employee-surface-styles';

export interface EmployeeProjectBoardShellProps {
  projectId: string;
  projectName: string;
  buckets: Bucket[];
  initialTasks: TaskCardData[];
  canUpdate: boolean;
  createTaskHref?: string | null;
  actions: {
    moveTask: (taskId: string, status: TaskStatus) => Promise<void>;
    getTaskDetail: (taskId: string) => Promise<TaskDetail | null>;
  };
}

export function EmployeeProjectBoardShell({
  projectId: _projectId,
  projectName,
  buckets,
  initialTasks,
  canUpdate,
  createTaskHref = null,
  actions,
}: EmployeeProjectBoardShellProps) {
  const t = useTranslations('employeeApp.projects');
  const tTasks = useTranslations('employeeApp.tasks');
  const [, startTransition] = useTransition();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const handleOpenTask = (taskId: string) => {
    setSelectedTaskId(taskId);
  };

  const handleMoveTask = (taskId: string, targetBucketId: string) => {
    if (!canUpdate) return;
    startTransition(async () => {
      try {
        await actions.moveTask(taskId, targetBucketId as TaskStatus);
      } catch {
        // noop — employee board is best-effort
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--pf-text-secondary)]">{projectName}</p>
        {createTaskHref ? (
          <Link href={createTaskHref} className={employeePrimaryButtonClass}>
            {tTasks('createNewTask')}
          </Link>
        ) : null}
      </div>

      <BoardView
        buckets={buckets}
        initialTasks={initialTasks}
        onOpenTask={handleOpenTask}
        onAddTask={() => {}}
        onMoveTask={canUpdate ? handleMoveTask : () => {}}
      />

      {selectedTaskId ? (
        <div className="rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 shadow-[var(--pf-shadow-sm)]">
          <Link
            href={`/employee/tasks/${selectedTaskId}`}
            className="text-sm font-semibold text-[var(--pf-action-primary)] hover:underline"
          >
            {t('openTaskDetail')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
