import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { getWorkspaceDetail } from '@/modules/workspaces';
// Agent A's real API
import {
  listBoards,
  listBuckets,
  listAccessibleTasks,
  createTask,
  updateTask,
  moveTaskToBucket,
  getTaskDetail,
} from '@/modules/tasks';
import type { CreateTaskInput } from '@/modules/tasks';
import {
  mapBoardToUiBoard,
  mapBucketToUiBucket,
  mapTaskToCardData,
} from '@/modules/tasks/ui/_task-api-stub';
import type { TaskCardData, TaskDetail } from '@/modules/tasks/ui/_task-api-stub';
import { BoardShell } from './_board-shell';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string; boardId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('boards.boardPageTitle') };
}

/**
 * Single Board view (bucket-based Kanban).
 * Fetches boards list (for switcher), active board's buckets, and tasks.
 */
export default async function WorkspaceBoardPage({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string; boardId: string }>;
}) {
  const { workspaceId, boardId } = await params;

  const data = await withOrgContext(async (context) => {
    const workspace = await getWorkspaceDetail(context, workspaceId);
    if (!workspace) return null;

    const [rawBoards, rawBuckets, rawTasks] = await Promise.all([
      listBoards(context, workspaceId),
      listBuckets(context, boardId),
      listAccessibleTasks(context, { workspaceId, boardId }),
    ]);

    const activeBoard = rawBoards.find((b) => b.id === boardId);
    if (!activeBoard) return null;

    const boards = rawBoards.map((b) => mapBoardToUiBoard(b));
    const taskCards = rawTasks.map((t) => mapTaskToCardData(t));

    // Map buckets with their tasks
    const tasksByBucket = new Map<string, TaskCardData[]>();
    for (const task of taskCards) {
      if (task.bucketId) {
        const arr = tasksByBucket.get(task.bucketId) ?? [];
        arr.push(task);
        tasksByBucket.set(task.bucketId, arr);
      }
    }
    const buckets = rawBuckets.map((b) =>
      mapBucketToUiBucket(b, tasksByBucket.get(b.id) ?? []),
    );

    return {
      workspace,
      boards,
      activeBoard: mapBoardToUiBoard(activeBoard),
      buckets,
      tasks: taskCards,
    };
  });

  if (!data) notFound();

  const { workspace: _workspace, boards, activeBoard, buckets, tasks } = data;

  // Server Actions bound to Agent A's real functions
  async function moveTaskAction(taskId: string, newBucketId: string, sortKey?: string) {
    'use server';
    await withOrgContext(async (ctx) => {
      await moveTaskToBucket(ctx, taskId, newBucketId, sortKey ? { sortKey } : {});
    });
  }

  async function createTaskAction(formData: CreateTaskInput) {
    'use server';
    const task = await withOrgContext(async (ctx) => createTask(ctx, formData));
    return mapTaskToCardData(task);
  }

  async function getTaskDetailAction(taskId: string): Promise<TaskDetail | null> {
    'use server';
    const result = await withOrgContext(async (ctx) => {
      const detail = await getTaskDetail(ctx, taskId);
      if (!detail) return null;
      return {
        ...mapTaskToCardData(detail),
        checklist: detail.checklistItems.map((ci) => ({
          id: ci.id,
          title: ci.title,
          done: ci.isDone,
        })),
        attachments: [], // TODO: attachments from Agent responsible for file storage
        comments: [],   // TODO: Agent E slot
        activityFeed: [], // TODO: Agent E slot
      } satisfies TaskDetail;
    });
    return result;
  }

  async function updateTaskAction(taskId: string, updateData: Record<string, unknown>) {
    'use server';
    await withOrgContext(async (ctx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateTask(ctx, taskId, updateData as any);
    });
  }

  return (
    <BoardShell
      workspaceId={workspaceId}
      boards={boards}
      activeBoard={activeBoard}
      buckets={buckets}
      initialTasks={tasks}
      actions={{
        moveTask: moveTaskAction,
        createTask: createTaskAction,
        getTaskDetail: getTaskDetailAction,
        updateTask: updateTaskAction,
      }}
    />
  );
}
