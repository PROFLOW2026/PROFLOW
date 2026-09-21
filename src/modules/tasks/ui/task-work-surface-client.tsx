'use client';

import { useMemo, useState } from 'react';
import { TaskDetailSheet } from './task-detail-sheet';
import {
  TaskFiltersBar,
  applyClientTaskFilters,
  DEFAULT_TASK_FILTER_STATE,
  type TaskFilterBarState,
} from './task-filters-bar';
import type { TaskCardData, TaskDetail } from './_task-api-stub';
import type { WorkActionState } from '@/app/[locale]/(app)/work/actions';

export interface TaskWorkSurfaceClientProps {
  tasks: TaskCardData[];
  today: string;
  showProject?: boolean;
  timelineDateEdit?: boolean;
  children: (props: {
    filteredTasks: TaskCardData[];
    onOpenTask: (taskId: string) => void;
    onUpdateDueDate?: (taskId: string, dueDate: string | null) => Promise<void>;
  }) => React.ReactNode;
  getTaskDetail: (taskId: string) => Promise<TaskDetail | null>;
  updateTask: (taskId: string, data: Record<string, unknown>) => Promise<WorkActionState>;
}

export function TaskWorkSurfaceClient({
  tasks,
  today,
  showProject: _showProject = true,
  timelineDateEdit = false,
  children,
  getTaskDetail,
  updateTask,
}: TaskWorkSurfaceClientProps) {
  const [filters, setFilters] = useState<TaskFilterBarState>(DEFAULT_TASK_FILTER_STATE);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filteredTasks = useMemo(
    () => applyClientTaskFilters(tasks, filters, today),
    [tasks, filters, today],
  );

  const handleOpenTask = async (taskId: string) => {
    setSelectedTaskId(taskId);
    setSheetOpen(true);
    const detail = await getTaskDetail(taskId);
    setTaskDetail(detail);
  };

  const handleUpdate = async (taskId: string, data: Record<string, unknown>) => {
    const result = await updateTask(taskId, data);
    const refreshed = await getTaskDetail(taskId);
    if (refreshed) setTaskDetail(refreshed);
    return result;
  };

  const handleUpdateDueDate = timelineDateEdit
    ? async (taskId: string, dueDate: string | null) => {
        await updateTask(taskId, { dueDate });
      }
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <TaskFiltersBar value={filters} onChange={setFilters} />

      {children({
        filteredTasks,
        onOpenTask: handleOpenTask,
        onUpdateDueDate: handleUpdateDueDate,
      })}

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
        onUpdate={handleUpdate}
      />
    </div>
  );
}
