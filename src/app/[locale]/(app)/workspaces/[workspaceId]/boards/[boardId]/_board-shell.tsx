'use client';

/**
 * BoardShell — Client component that hosts the interactive Kanban board.
 *
 * Responsibilities:
 *  - Board switcher (horizontal tabs across boards in workspace)
 *  - Renders BoardView with bucket columns
 *  - Handles drag/drop via onMoveTask → fires moveTaskToBucket Server Action
 *  - Handles task click → opens TaskDetailSheet
 *  - Handles quick-add → fires createTask Server Action
 *
 * Agent A dependency:
 *  - moveTaskToBucket, createTask — stubs; TODO swap to real SA from Agent A
 */

import { useState, useTransition } from 'react';
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
import type {
  Board,
  Bucket,
  TaskCardData,
  TaskDetail,
} from '@/modules/tasks/ui/_task-api-stub';
import type { CreateTaskInput } from '@/modules/tasks';

export interface BoardShellProps {
  workspaceId: string;
  boards: Board[];
  activeBoard: Board;
  buckets: Bucket[];
  initialTasks: TaskCardData[];
  /**
   * Server actions provided by the page — Agent A's functions wrapped in SA.
   * TODO: replace stubs with real Server Actions once Agent A delivers.
   */
  actions: {
    /** Agent A's moveTaskToBucket wrapped in SA. sortKey is optional (Agent A computes one if omitted). */
    moveTask: (taskId: string, bucketId: string, sortKey?: string) => Promise<void>;
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
  const [, startTransition] = useTransition();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [defaultBucketForCreate, setDefaultBucketForCreate] = useState<string | null>(null);

  const handleOpenTask = async (taskId: string) => {
    setSelectedTaskId(taskId);
    setSheetOpen(true);
    const detail = await actions.getTaskDetail(taskId);
    setTaskDetail(detail);
  };

  const handleAddTask = (title: string, bucketId: string) => {
    // Quick-add: fires createTask with just title, then re-renders
    startTransition(async () => {
      try {
        await actions.createTask({
          title,
          description: '',
          bucketId,
          priority: 'medium',
          dueDate: null,
          projectId: null,
          workspaceId,
        });
      } catch {
        // TODO: surface error toast
      }
    });
  };

  const handleMoveTask = (
    taskId: string,
    targetBucketId: string,
    _afterTaskId: string | null,
  ) => {
    // Agent A's moveTaskToBucket generates a sortKey if none is provided.
    // TODO: When Agent A's lexorank helpers are wired into the client, compute
    //       insertBetween(prevKey, nextKey) for precise ordering.
    startTransition(async () => {
      try {
        await actions.moveTask(taskId, targetBucketId);
      } catch {
        // TODO: surface error toast
      }
    });
  };

  const handleUpdateTask = (taskId: string, data: Record<string, unknown>) => {
    startTransition(async () => {
      try {
        await actions.updateTask(taskId, data);
      } catch {
        // TODO: surface error toast
      }
    });
  };

  const activeBoards = boards.filter((b) => !b.isArchived);

  return (
    <div className="flex flex-col gap-4">
      {/* Board switcher — horizontal tabs */}
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

          {/* Create board */}
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

      {/* Board header: name + create-task button */}
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
              defaultBucketId={defaultBucketForCreate}
              defaultWorkspaceId={workspaceId}
              onSubmit={async (data) => {
                await actions.createTask(data as CreateTaskInput);
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
