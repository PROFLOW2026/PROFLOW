'use client';

import { useState, useTransition } from 'react';
import { TaskDetailSheet } from '@/modules/tasks/ui/task-detail-sheet';
import type { TaskDetail } from '@/modules/tasks/ui/_task-api-stub';
import type { WorkActionState } from '../../work/actions';

interface TaskDetailPageClientProps {
  initialTask: TaskDetail;
  onUpdate: (taskId: string, data: Record<string, unknown>) => Promise<WorkActionState>;
}

/**
 * Full-page task detail — reuses TaskDetailSheet field UI in an always-visible panel.
 */
export function TaskDetailPageClient({ initialTask, onUpdate }: TaskDetailPageClientProps) {
  const [task, setTask] = useState(initialTask);
  const [, startTransition] = useTransition();

  const handleUpdate = (taskId: string, data: Record<string, unknown>) => {
    startTransition(async () => {
      const result = await onUpdate(taskId, data);
      if (result.success) {
        setTask((prev) => ({ ...prev, ...data }) as TaskDetail);
      }
    });
  };

  return (
    <div className="rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]">
      <TaskDetailSheet
        task={task}
        open
        embedded
        onOpenChange={() => {}}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
