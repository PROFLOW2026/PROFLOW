'use client';

import { useMemo, useState } from 'react';
import { TaskCalendarView } from './task-calendar-view';
import { TaskDetailSheet } from './task-detail-sheet';
import {
  TaskFiltersBar,
  applyClientTaskFilters,
  DEFAULT_TASK_FILTER_STATE,
  type TaskFilterBarState,
} from './task-filters-bar';
import { TaskTimelineView } from './task-timeline-view';
import type { TaskCardData, TaskDetail } from './_task-api-stub';
import type { WorkActionState } from '@/app/[locale]/(app)/work/actions';

export interface TaskWorkSurfaceClientProps {
  tasks: TaskCardData[];
  today: string;
  viewMode: 'calendar' | 'timeline';
  showProject?: boolean;
  timelineDateEdit?: boolean;
  getTaskDetail: (taskId: string) => Promise<TaskDetail | null>;
  updateTask: (taskId: string, data: Record<string, unknown>) => Promise<WorkActionState>;
}

export function TaskWorkSurfaceClient({
  tasks,
  today,
  viewMode,
  showProject = true,
  timelineDateEdit = false,
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

      {viewMode === 'calendar' ? (
        <TaskCalendarView
          tasks={filteredTasks}
          today={today}
          onOpenTask={handleOpenTask}
          showProject={showProject}
        />
      ) : (
        <TaskTimelineView
          tasks={filteredTasks}
          onOpenTask={handleOpenTask}
          onUpdateDueDate={handleUpdateDueDate}
          showProject={showProject}
        />
      )}

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
