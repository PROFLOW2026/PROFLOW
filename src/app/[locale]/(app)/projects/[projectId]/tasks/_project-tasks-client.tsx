'use client';

/**
 * ProjectTasksClient — Client shell for project task list.
 * Renders TaskListView + TaskDetailSheet.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TaskListView } from '@/modules/tasks/ui/task-list-view';
import { TaskDetailSheet } from '@/modules/tasks/ui/task-detail-sheet';
import type { TaskCardData, TaskDetail } from '@/modules/tasks/ui/_task-api-stub';

export function ProjectTasksClient({
  tasks,
  projectId: _projectId,
}: {
  tasks: TaskCardData[];
  projectId: string;
}) {
  const t = useTranslations('tasks');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleOpenTask = async (taskId: string) => {
    setSelectedTaskId(taskId);
    setSheetOpen(true);
    // TODO: call getTaskDetail server action from Agent A
    // const detail = await getTaskDetailAction(taskId);
    // setTaskDetail(detail);
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
        onUpdate={(_taskId, _data) => {
          // TODO: wire to updateTask server action from Agent A
        }}
      />
    </>
  );
}
