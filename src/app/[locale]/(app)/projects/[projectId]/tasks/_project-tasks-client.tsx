'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { TaskListView } from '@/modules/tasks/ui/task-list-view';
import { TaskDetailSheet } from '@/modules/tasks/ui/task-detail-sheet';
import type { TaskCardData, TaskDetail } from '@/modules/tasks/ui/_task-api-stub';
import type { WorkActionState } from '@/app/[locale]/(app)/work/actions';

export function ProjectTasksClient({
  tasks,
  projectId: _projectId,
  getTaskDetail,
  updateTask,
}: {
  tasks: TaskCardData[];
  projectId: string;
  getTaskDetail: (taskId: string) => Promise<TaskDetail | null>;
  updateTask: (taskId: string, data: Record<string, unknown>) => Promise<WorkActionState>;
}) {
  const t = useTranslations('tasks');
  const [, startTransition] = useTransition();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleOpenTask = async (taskId: string) => {
    setSelectedTaskId(taskId);
    setSheetOpen(true);
    const detail = await getTaskDetail(taskId);
    setTaskDetail(detail);
  };

  const handleUpdate = (taskId: string, data: Record<string, unknown>) => {
    startTransition(async () => {
      await updateTask(taskId, data);
      const refreshed = await getTaskDetail(taskId);
      if (refreshed) setTaskDetail(refreshed);
    });
  };

  return (
    <>
      <TaskListView
        tasks={tasks}
        onOpenTask={handleOpenTask}
        showProject={false}
        emptyTitle={t('list.empty.title')}
        emptyDescription={t('list.empty.description')}
      />

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
    </>
  );
}
