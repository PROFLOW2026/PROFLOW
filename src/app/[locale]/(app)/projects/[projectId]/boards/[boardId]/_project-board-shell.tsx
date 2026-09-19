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
  };
}

export function ProjectBoardShell({
  projectId,
  workspaceId,
  boards,
  activeBoard,
  buckets,
  initialTasks,
  actions,
}: ProjectBoardShellProps) {
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
      {/* Board switcher */}
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
                href={`/projects/${projectId}/boards/${board.id}`}
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
              defaultProjectId={projectId}
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
