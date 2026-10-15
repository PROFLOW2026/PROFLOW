'use client';

/**
 * ProjectBoardShell — Identical to WorkspaceBoardShell but scoped to a project.
 *
 * Board switcher shows only boards linked to this project's workspace.
 * Task cards show workspace + board breadcrumb context.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { useToast } from '@/components/ui/toast';
import { BoardBucketsPanel } from '@/modules/tasks/ui/board-buckets-panel';
import { BoardView } from '@/modules/tasks/ui/board-view';
import { BoardTaskLoadMore, mergeTaskCardsById } from '@/modules/tasks/ui/board-task-load-more';
import { TaskDetailSheet } from '@/modules/tasks/ui/task-detail-sheet';
import { TaskCreateForm } from '@/modules/tasks/ui/task-create-form';
import type {
  Board,
  Bucket,
  TaskCardData,
  TaskDetail,
  TaskPriority,
} from '@/modules/tasks/ui/task-api';
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
    moveTask: (
      taskId: string,
      bucketId: string,
      afterTaskId?: string | null,
      beforeTaskId?: string | null,
    ) => Promise<void>;
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
  canArchive?: boolean;
  canManageBuckets?: boolean;
  initialHasMore?: boolean;
  loadMoreBoardTasks?: (offset: number) => Promise<{ tasks: TaskCardData[]; hasMore: boolean }>;
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
  canArchive = false,
  canManageBuckets = false,
  today,
  initialHasMore = false,
  loadMoreBoardTasks,
}: ProjectBoardShellProps & { today: string }) {
  const t = useTranslations('tasks');
  const router = useRouter();
  const toast = useToast();
  const [boardTasks, setBoardTasks] = useState(initialTasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset local board state when server props refresh
    setBoardTasks(initialTasks);
  }, [initialTasks]);

  const handleOpenTask = async (taskId: string) => {
    setSelectedTaskId(taskId);
    setSheetOpen(true);
    const detail = await actions.getTaskDetail(taskId);
    setTaskDetail(detail);
  };

  const handleAddTask = async (title: string, bucketId: string) => {
    try {
      const card = await actions.createTask({
        title,
        description: '',
        bucketId,
        boardId: activeBoard.id,
        priority: 'medium',
        dueDate: null,
        projectId,
        workspaceId,
      });
      setBoardTasks((prev) => [...prev, card]);
      router.refresh();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : t('saveFailed'), 'danger');
    }
  };

  const handleMoveTask = async (
    taskId: string,
    targetBucketId: string,
    afterTaskId: string | null,
    beforeTaskId?: string | null,
  ) => {
    try {
      await actions.moveTask(taskId, targetBucketId, afterTaskId, beforeTaskId);
      router.refresh();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : t('saveFailed'), 'danger');
      throw error;
    }
  };

  const handleReassign = async (taskId: string, assigneeKey: string | null) => {
    if (!canAssign) return;
    try {
      await actions.syncAssignees(taskId, {
        assigneeKeys: assigneeKey ? [assigneeKey] : [],
      });
      router.refresh();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : t('saveFailed'), 'danger');
      throw error;
    }
  };

  const handleChangePriority = async (taskId: string, priority: TaskPriority) => {
    try {
      await actions.updateTask(taskId, { priority });
      router.refresh();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : t('saveFailed'), 'danger');
      throw error;
    }
  };

  const handleUpdateTask = async (taskId: string, data: Record<string, unknown>) => {
    try {
      await actions.updateTask(taskId, data);
      const refreshed = await actions.getTaskDetail(taskId);
      if (refreshed) setTaskDetail(refreshed);
      router.refresh();
      return { success: true as const };
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : t('saveFailed'),
      };
    }
  };

  const activeBoards = boards.filter((b) => !b.isArchived);

  return (
    <div className="flex flex-col gap-4">
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

      <BoardBucketsPanel
        boardId={activeBoard.id}
        buckets={buckets}
        canManage={canManageBuckets}
      />

      {loadMoreBoardTasks ? (
        <BoardTaskLoadMore
          initialHasMore={initialHasMore}
          taskCount={boardTasks.length}
          onLoadMore={loadMoreBoardTasks}
          onTasksAppended={(incoming) => {
            setBoardTasks((prev) => mergeTaskCardsById(prev, incoming));
          }}
        />
      ) : null}

      <BoardView
        buckets={buckets}
        initialTasks={boardTasks}
        onOpenTask={handleOpenTask}
        onAddTask={handleAddTask}
        onMoveTask={handleMoveTask}
        onReassign={canAssign ? handleReassign : undefined}
        onChangePriority={handleChangePriority}
        showInlineFilters={!loadMoreBoardTasks}
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
                router.refresh();
              }
            : undefined
        }
        today={today}
        canPostpone
        timeLogBasePath="/workforce/time/new"
        canArchive={canArchive}
        onTaskArchived={() => router.refresh()}
      />

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
                try {
                  const card = await actions.createTask({
                    workspaceId,
                    boardId: activeBoard.id,
                    title: data.title,
                    description: data.description,
                    projectId,
                    bucketId: data.bucketId,
                    priority: data.priority,
                    dueDate: data.dueDate,
                    assigneeKeys: data.assigneeKeys,
                    assignAllProjectTeam: data.assignAllProjectTeam,
                  });
                  setBoardTasks((prev) => [...prev, card]);
                  setCreateSheetOpen(false);
                  router.refresh();
                } catch (error) {
                  toast.push(error instanceof Error ? error.message : t('saveFailed'), 'danger');
                }
              }}
              onCancel={() => setCreateSheetOpen(false)}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
