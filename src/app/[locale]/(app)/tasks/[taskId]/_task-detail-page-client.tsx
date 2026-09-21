'use client';

import { useState } from 'react';
import { TaskDetailSheet } from '@/modules/tasks/ui/task-detail-sheet';
import type { TaskDetail } from '@/modules/tasks/ui/_task-api-stub';
import type { WorkActionState } from '../../work/actions';
import { uwmPrimaryPanelClass } from '@/shared/ui/uwm-surface-styles';

interface TaskDetailPageClientProps {
  initialTask: TaskDetail;
  onUpdate: (taskId: string, data: Record<string, unknown>) => Promise<WorkActionState>;
}

/**
 * Full-page task detail — reuses TaskDetailSheet field UI in an always-visible panel.
 */
export function TaskDetailPageClient({ initialTask, onUpdate }: TaskDetailPageClientProps) {
  const [task, setTask] = useState(initialTask);

  async function handleUpdate(taskId: string, data: Record<string, unknown>) {
    const result = await onUpdate(taskId, data);
    if (result.success) {
      setTask((prev) => ({ ...prev, ...data }) as TaskDetail);
    }
    return result;
  }

  return (
    <div className={uwmPrimaryPanelClass}>
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
