import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getWorkspaceDetail } from '@/modules/workspaces';
import {
  listBoards,
  listBuckets,
  listAccessibleTasksPage,
  createTask,
  updateTask,
  moveTaskToBucket,
  getTaskDetail,
} from '@/modules/tasks';
import type { CreateTaskInput } from '@/modules/tasks';
import {
  mapBoardToUiBoard,
  mapBucketToUiBucket,
} from '@/modules/tasks/ui/task-api';
import type { TaskCardData, TaskDetail } from '@/modules/tasks/ui/task-api';
import { mapTaskDetailToUiForOrg, mapTasksToCardDataForOrg } from '@/modules/tasks/application/map-tasks-for-ui';
import { TASK_LIST_MAX_LIMIT } from '@/modules/tasks/domain/list-window';
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
  searchParams,
}: {
  params: Promise<{ locale: string; workspaceId: string; boardId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ workspaceId, boardId }, urlParams] = await Promise.all([params, searchParams]);
  const { parseBoardTaskListFilters } = await import(
    '@/modules/tasks/application/parse-board-task-list-filters'
  );
  const listFilters = parseBoardTaskListFilters(urlParams);
  const shell = await getShellContext();
  const canAssign = shell?.permissions.has(PERMISSIONS.TASKS_ASSIGN) ?? false;
  const canArchive = shell?.permissions.has(PERMISSIONS.TASKS_DELETE) ?? false;
  const canManageBuckets = shell?.permissions.has(PERMISSIONS.WORKSPACES_MANAGE) ?? false;

  const data = await withOrgContext(async (context) => {
    const workspace = await getWorkspaceDetail(context, workspaceId);
    if (!workspace) return null;

    const [rawBoards, rawBuckets, taskPage] = await Promise.all([
      listBoards(context, workspaceId),
      listBuckets(context, boardId),
      listAccessibleTasksPage(context, {
        workspaceId,
        boardId,
        limit: TASK_LIST_MAX_LIMIT,
        ...listFilters,
      }),
    ]);

    const activeBoard = rawBoards.find((b) => b.id === boardId);
    if (!activeBoard) return null;

    const boards = rawBoards.map((b) => mapBoardToUiBoard(b));
    const taskCards = await mapTasksToCardDataForOrg(context, taskPage.tasks);

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

    const { listBoardAssigneeFilterOptions, listBoardLabelFilterOptions } = await import(
      '@/modules/tasks/application/list-board-filter-options'
    );
    const [boardFilterAssignees, boardFilterLabels] = await Promise.all([
      listBoardAssigneeFilterOptions(context, { workspaceId }),
      listBoardLabelFilterOptions(context),
    ]);

    return {
      workspace,
      boards,
      activeBoard: mapBoardToUiBoard(activeBoard),
      buckets,
      tasks: taskCards,
      hasMore: taskPage.hasMore,
      boardFilterAssignees,
      boardFilterLabels,
    };
  });

  if (!data) notFound();

  const {
    workspace: _workspace,
    boards,
    activeBoard,
    buckets,
    tasks,
    hasMore,
    boardFilterAssignees,
    boardFilterLabels,
  } = data;

  async function moveTaskAction(
    taskId: string,
    newBucketId: string,
    afterTaskId?: string | null,
    beforeTaskId?: string | null,
  ) {
    'use server';
    await withOrgContext(async (ctx) => {
      await moveTaskToBucket(ctx, taskId, newBucketId, {
        ...(afterTaskId != null ? { afterTaskId } : {}),
        ...(beforeTaskId ? { beforeTaskId } : {}),
      });
    });
  }

  async function createTaskAction(formData: CreateTaskInput) {
    'use server';
    return withOrgContext(async (ctx) => {
      const task = await createTask(ctx, formData);
      const cards = await mapTasksToCardDataForOrg(ctx, [task]);
      return cards[0]!;
    });
  }

  async function getTaskDetailAction(taskId: string): Promise<TaskDetail | null> {
    'use server';
    return withOrgContext(async (ctx) => {
      const detail = await getTaskDetail(ctx, taskId);
      if (!detail) return null;
      return mapTaskDetailToUiForOrg(ctx, detail);
    });
  }

  async function updateTaskAction(taskId: string, updateData: Record<string, unknown>) {
    'use server';
    await withOrgContext(async (ctx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateTask(ctx, taskId, updateData as any);
    });
  }

  async function loadMoreBoardTasksAction(offset: number) {
    'use server';
    const { loadMoreAccessibleTasksAction } = await import('@/app/[locale]/(app)/work/actions');
    const { parseBoardTaskListFilters: parseFilters } = await import(
      '@/modules/tasks/application/parse-board-task-list-filters'
    );
    const filters = parseFilters(urlParams);
    const page = await loadMoreAccessibleTasksAction({
      offset,
      boardId,
      workspaceId,
      listFilters: filters,
    });
    return { tasks: page.tasks, hasMore: page.hasMore };
  }

  const { BoardSavedViewsChrome } = await import('@/modules/tasks/ui/board-saved-views-chrome');
  const { BoardUrlFiltersBar } = await import('@/modules/tasks/ui/board-url-filters-bar');

  return (
    <MainAppPage>
      <MainAppSection>
        <BoardUrlFiltersBar
          searchParams={urlParams}
          buckets={buckets.map((b) => ({ id: b.id, name: b.name }))}
          assignees={boardFilterAssignees}
          labels={boardFilterLabels}
        />
        <BoardSavedViewsChrome searchParams={urlParams} boardId={boardId} />
        <BoardShell
          workspaceId={workspaceId}
          boards={boards}
          activeBoard={activeBoard}
          buckets={buckets}
          initialTasks={tasks}
          canAssign={canAssign}
          canArchive={canArchive}
          canManageBuckets={canManageBuckets}
          initialHasMore={hasMore}
          loadMoreBoardTasks={loadMoreBoardTasksAction}
          actions={{
            moveTask: moveTaskAction,
            createTask: createTaskAction,
            getTaskDetail: getTaskDetailAction,
            updateTask: updateTaskAction,
          }}
        />
      </MainAppSection>
    </MainAppPage>
  );
}
