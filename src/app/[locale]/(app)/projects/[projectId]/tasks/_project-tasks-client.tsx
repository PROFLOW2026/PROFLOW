'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { TaskListView } from '@/modules/tasks/ui/task-list-view';
import { TaskDetailSheet } from '@/modules/tasks/ui/task-detail-sheet';
import { TaskCreateForm } from '@/modules/tasks/ui/task-create-form';
import type { TaskCardData, TaskDetail } from '@/modules/tasks/ui/_task-api-stub';
import type { CreateTaskInput } from '@/modules/tasks';
import type { TaskAssigneePickerOption } from '@/modules/tasks/ui/task-assignee-picker';
import type { WorkActionState } from '@/app/[locale]/(app)/work/actions';
import { uwmPrimaryPanelClass } from '@/shared/ui/uwm-surface-styles';

export function ProjectTasksClient({
  tasks: initialTasks,
  projectId,
  workspaceId,
  getTaskDetail,
  updateTask,
  createTask,
  syncAssignees,
  assigneeOptions = [],
  canAssign = false,
  today,
  initialCreateOpen = false,
}: {
  tasks: TaskCardData[];
  projectId: string;
  workspaceId: string;
  getTaskDetail: (taskId: string) => Promise<TaskDetail | null>;
  updateTask: (taskId: string, data: Record<string, unknown>) => Promise<WorkActionState>;
  createTask: (data: CreateTaskInput) => Promise<TaskCardData>;
  syncAssignees: (
    taskId: string,
    input: { assigneeKeys?: string[]; assignAllProjectTeam?: boolean },
  ) => Promise<void>;
  assigneeOptions?: TaskAssigneePickerOption[];
  canAssign?: boolean;
  today: string;
  initialCreateOpen?: boolean;
}) {
  const t = useTranslations('tasks');
  const [, startTransition] = useTransition();
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createSheetOpen, setCreateSheetOpen] = useState(initialCreateOpen);

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

  const refreshTaskInList = async (taskId: string) => {
    const detail = await getTaskDetail(taskId);
    if (!detail) return;
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              title: detail.title,
              status: detail.status,
              priority: detail.priority,
              dueDate: detail.dueDate,
              assignees: detail.assignees,
            }
          : task,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setCreateSheetOpen(true)}>
          <Plus aria-hidden className="size-4" />
          {t('addTask')}
        </Button>
      </div>

      <div className={uwmPrimaryPanelClass}>
        <TaskListView
          tasks={tasks}
          onOpenTask={handleOpenTask}
          showProject={false}
          editable
          onUpdateTask={async (taskId, data) => {
            const result = await handleUpdate(taskId, data);
            await refreshTaskInList(taskId);
            return result;
          }}
          emptyTitle={t('list.empty.title')}
          emptyDescription={t('list.empty.description')}
        />
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
        onUpdate={handleUpdate}
        onRefresh={async (taskId) => {
          const refreshed = await getTaskDetail(taskId);
          if (refreshed) setTaskDetail(refreshed);
          await refreshTaskInList(taskId);
        }}
        assigneeOptions={assigneeOptions}
        canAssign={canAssign}
        onAssigneesChange={
          canAssign
            ? async (input) => {
                if (!selectedTaskId) return;
                await syncAssignees(selectedTaskId, input);
                await refreshTaskInList(selectedTaskId);
              }
            : undefined
        }
        today={today}
        canPostpone
        timeLogBasePath="/workforce/time/new"
      />

      <Sheet open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
        <SheetContent side="end" className="w-full sm:max-w-lg" closeLabel={t('close')}>
          <SheetHeader>
            <SheetTitle>{t('create.title')}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <TaskCreateForm
              assignees={assigneeOptions}
              defaultProjectId={projectId}
              defaultWorkspaceId={workspaceId}
              onSubmit={async (data) => {
                startTransition(async () => {
                  const created = await createTask({
                    workspaceId,
                    title: data.title,
                    description: data.description,
                    projectId,
                    priority: data.priority,
                    dueDate: data.dueDate,
                    assigneeKeys: data.assigneeKeys,
                    assignAllProjectTeam: data.assignAllProjectTeam,
                  });
                  setTasks((current) => [...current, created]);
                  setCreateSheetOpen(false);
                });
              }}
              onCancel={() => setCreateSheetOpen(false)}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
