'use client';

/**
 * BoardShell — Client component that hosts the interactive Kanban board.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { Badge } from '@/components/ui/badge';
import { BoardView } from '@/modules/tasks/ui/board-view';
import { TaskDetailSheet } from '@/modules/tasks/ui/task-detail-sheet';
import { TaskCreateForm } from '@/modules/tasks/ui/task-create-form';
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
import type {
  Board,
  Bucket,
  TaskCardData,
  TaskDetail,
  TaskPriority,
} from '@/modules/tasks/ui/task-api';
import type { CreateTaskInput } from '@/modules/tasks';

export interface BoardShellProps {
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
  };
}

export function BoardShell({
  workspaceId,
  boards,
  activeBoard,
  buckets,
  initialTasks,
  actions,
}: BoardShellProps) {
  const t = useTranslations('tasks');
  const router = useRouter();
  const toast = useToast();
  const [boardTasks, setBoardTasks] = useState(initialTasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [defaultBucketForCreate, setDefaultBucketForCreate] = useState<string | null>(null);

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
        projectId: null,
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
      router.refresh();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : t('saveFailed'), 'danger');
    }
  };

  const activeBoards = boards.filter((b) => !b.isArchived);

  return (
    <div className="flex flex-col gap-4">
      {activeBoards.length > 1 && (
        <nav
          aria-label={t('boards.switcherLabel')}
          className="flex overflow-x-auto border-b border-[var(--pf-border-default)]"
        >
          {activeBoards.map((board) => {
            const active = board.id === activeBoard.id;
            return (
              <Link
                key={board.id}
                href={`/workspaces/${workspaceId}/boards/${board.id}`}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                  active
                    ? 'border-[var(--pf-border-brand)] text-[var(--pf-text-brand)]'
                    : 'border-transparent text-[var(--pf-text-secondary)] hover:border-[var(--pf-border-default)] hover:text-[var(--pf-text-primary)]',
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

          <div className="ms-auto flex items-center pe-1">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/workspaces/${workspaceId}/boards/new`}>
                <Plus aria-hidden className="size-4" />
                <span className="hidden sm:inline">{t('boards.createBoard')}</span>
              </Link>
            </Button>
          </div>
        </nav>
      )}

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">{activeBoard.name}</h1>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setDefaultBucketForCreate(null);
            setCreateSheetOpen(true);
          }}
        >
          <Plus aria-hidden className="size-4" />
          {t('addTask')}
        </Button>
      </div>

      <BoardView
        buckets={buckets}
        initialTasks={boardTasks}
        onOpenTask={handleOpenTask}
        onAddTask={handleAddTask}
        onMoveTask={handleMoveTask}
        onChangePriority={handleChangePriority}
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
      />

      <Sheet open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
        <SheetContent side="end" className="w-full sm:max-w-lg" closeLabel={t('close')}>
          <SheetHeader>
            <SheetTitle>{t('create.title')}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <TaskCreateForm
              buckets={buckets.map((b) => ({ id: b.id, name: b.name }))}
              defaultBucketId={defaultBucketForCreate}
              defaultWorkspaceId={workspaceId}
              onSubmit={async (data) => {
                try {
                  const card = await actions.createTask({
                    ...(data as CreateTaskInput),
                    workspaceId,
                    boardId: activeBoard.id,
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
