'use client';

/**
 * ProjectBoardShell — Identical to WorkspaceBoardShell but scoped to a project.
 *
 * Board switcher shows only boards linked to this project's workspace.
 * Task cards show workspace + board breadcrumb context.
 */

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { uwmTabBarClass, uwmTabClass } from '@/shared/ui/uwm-surface-styles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
} from '@/components/ui/sheet';
import { BoardView } from '@/modules/tasks/ui/board-view';
import { TaskDetailSheet } from '@/modules/tasks/ui/task-detail-sheet';
import { TaskCreateForm } from '@/modules/tasks/ui/task-create-form';
import type {
  Board,
  Bucket,
  TaskCardData,
  TaskDetail,
} from '@/modules/tasks/ui/_task-api-stub';
import type { CreateTaskInput } from '@/modules/tasks';
import type { TaskAssigneePickerOption } from '@/modules/tasks/ui/task-assignee-picker';

export interface ProjectBoardShellProps {
  projectId: string;
  workspaceId: string;
  boards: Board[];
  activeBoard: Board;
  buckets: Bucket[];
  initialTasks: TaskCardData[];
  actions: {
    moveTask: (taskId: string, bucketId: string, sortKey?: string) => Promise<void>;
    createTask: (data: CreateTaskInput) => Promise<TaskCardData>;
    getTaskDetail: (taskId: string) => Promise<TaskDetail | null>;
    updateTask: (taskId: string, data: Record<string, unknown>) => Promise<void>;
    syncAssignees: (
      taskId: string,
      input: { assigneeKeys?: string[]; assignAllProjectTeam?: boolean },
    ) => Promise<void>;
  };
  assigneeOptions?: TaskAssigneePickerOption[];
  canAssign?: boolean;
}

export function ProjectBoardShell({
  projectId,
  workspaceId,
  boards,
  activeBoard,
  buckets,
  initialTasks,
  actions,
  assigneeOptions = [],
  canAssign = false,
  today,
}: ProjectBoardShellProps & { today: string }) {
  const t = useTranslations('tasks');
  const [, startTransition] = useTransition();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  const handleOpenTask = async (taskId: string) => {
    setSelectedTaskId(taskId);
    setSheetOpen(true);
    const detail = await actions.getTaskDetail(taskId);
    setTaskDetail(detail);
  };

  const handleAddTask = (title: string, bucketId: string) => {
    startTransition(async () => {
      try {
        await actions.createTask({
          title,
          description: '',
          bucketId,
          priority: 'medium',
          dueDate: null,
          projectId,
          workspaceId,
        });
      } catch {
        // TODO: surface error toast
      }
    });
  };

  const handleMoveTask = (taskId: string, targetBucketId: string, _afterTaskId: string | null) => {
    startTransition(async () => {
      try {
        await actions.moveTask(taskId, targetBucketId);
      } catch {
        // TODO: surface error toast
      }
    });
  };

  const handleUpdateTask = async (taskId: string, data: Record<string, unknown>) => {
    try {
      await actions.updateTask(taskId, data);
      const refreshed = await actions.getTaskDetail(taskId);
      if (refreshed) setTaskDetail(refreshed);
      return { success: true as const };
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : 'Update failed',
      };
    }
  };

  const activeBoards = boards.filter((b) => !b.isArchived);

  return (
    <div className="flex flex-col gap-4">
      {/* Board switcher */}
      {activeBoards.length > 1 && (
        <nav
          aria-label={t('boards.switcherLabel')}
          className={cn(uwmTabBarClass, 'overflow-x-auto')}
        >
          {activeBoards.map((board) => {
            const active = board.id === activeBoard.id;
            return (
              <Link
                key={board.id}
                href={`/projects/${projectId}/boards/${board.id}`}
                className={cn(
                  uwmTabClass(active),
                  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap no-underline',
                )}
                aria-current={active ? 'page' : undefined}
              >
                {board.name}
                {board.isDefault && (
                  <Badge tone="brand" className="text-[0.6rem]">
                    {t('boards.default')}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>
      )}

      {/* Board header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{activeBoard.name}</h2>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setCreateSheetOpen(true)}
        >
          <Plus aria-hidden className="size-4" />
          {t('addTask')}
        </Button>
      </div>

      {/* Kanban board */}
      <BoardView
        buckets={buckets}
        initialTasks={initialTasks}
        onOpenTask={handleOpenTask}
        onAddTask={handleAddTask}
        onMoveTask={handleMoveTask}
      />

      {/* Task detail sheet */}
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
        onUpdate={handleUpdateTask}
        onRefresh={async (taskId) => {
          const refreshed = await actions.getTaskDetail(taskId);
          if (refreshed) setTaskDetail(refreshed);
        }}
        assigneeOptions={assigneeOptions}
        canAssign={canAssign}
        onAssigneesChange={
          canAssign
            ? async (input) => {
                if (!selectedTaskId) return;
                await actions.syncAssignees(selectedTaskId, input);
              }
            : undefined
        }
        today={today}
        canPostpone
        timeLogBasePath="/workforce/time/new"
      />

      {/* Create task sheet */}
      <Sheet open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
        <SheetContent side="end" className="w-full sm:max-w-lg" closeLabel={t('close')}>
          <SheetHeader>
            <SheetTitle>{t('create.title')}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <TaskCreateForm
              buckets={buckets.map((b) => ({ id: b.id, name: b.name }))}
              assignees={assigneeOptions}
              defaultProjectId={projectId}
              defaultWorkspaceId={workspaceId}
              onSubmit={async (data) => {
                await actions.createTask({
                  workspaceId,
                  title: data.title,
                  description: data.description,
                  projectId,
                  bucketId: data.bucketId,
                  priority: data.priority,
                  dueDate: data.dueDate,
                  assigneeKeys: data.assigneeKeys,
                  assignAllProjectTeam: data.assignAllProjectTeam,
                });
                setCreateSheetOpen(false);
              }}
              onCancel={() => setCreateSheetOpen(false)}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
