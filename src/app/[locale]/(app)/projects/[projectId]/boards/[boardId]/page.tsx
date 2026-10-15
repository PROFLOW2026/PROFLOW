import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates';
import {
  findWorkspaceIdsByProject,
  getWorkspaceDetail,
} from '@/modules/workspaces';
// Agent A's real API
import {
  listBoards,
  listBuckets,
  listAccessibleTasksPage,
  createTask,
  updateTask,
  moveTaskToBucket,
  getTaskDetail,
  callerHasTaskAssignGrant,
} from '@/modules/tasks';
import { TASK_LIST_MAX_LIMIT } from '@/modules/tasks/domain/list-window';
import { listProjectParticipantAssigneeOptions } from '@/modules/projects';
import type { CreateTaskInput } from '@/modules/tasks';
import {
  mapBoardToUiBoard,
  mapBucketToUiBucket,
} from '@/modules/tasks/ui/task-api';
import type { TaskCardData, TaskDetail } from '@/modules/tasks/ui/task-api';
import { mapTaskDetailToUiForOrg, mapTasksToCardDataForOrg } from '@/modules/tasks/application/map-tasks-for-ui';
import { ProjectBoardShell } from './_project-board-shell';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; projectId: string; boardId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('boards.boardPageTitle') };
}

export default async function ProjectBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; projectId: string; boardId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ projectId, boardId }, urlParams] = await Promise.all([params, searchParams]);
  const { parseBoardTaskListFilters } = await import(
    '@/modules/tasks/application/parse-board-task-list-filters'
  );
  const listFilters = parseBoardTaskListFilters(urlParams);

  const data = await withOrgContext(async (context) => {
    const workspaceIds = await findWorkspaceIdsByProject(context.db, projectId);
    if (workspaceIds.length === 0) return null;

    const primaryWsId = workspaceIds[0];
    if (!primaryWsId) return null;
    const workspace = await getWorkspaceDetail(context, primaryWsId);
    if (!workspace) return null;

    const [rawBoards, rawBuckets, taskPage] = await Promise.all([
      listBoards(context, primaryWsId),
      listBuckets(context, boardId ?? ''),
      listAccessibleTasksPage(context, {
        boardId,
        projectId,
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

    const [assigneeOptions, boardFilterAssignees, boardFilterLabels] = await Promise.all([
      callerHasTaskAssignGrant(context)
        ? listProjectParticipantAssigneeOptions(context, projectId).then((rows) =>
            rows.map((option) => ({
              key: option.key,
              displayName: option.displayName,
              jobTitle: option.jobTitle,
            })),
          )
        : Promise.resolve([]),
      listBoardAssigneeFilterOptions(context, { projectId }),
      listBoardLabelFilterOptions(context),
    ]);

    return {
      workspaceId: primaryWsId,
      boards,
      activeBoard: mapBoardToUiBoard(activeBoard),
      buckets,
      tasks: taskCards,
      hasMore: taskPage.hasMore,
      today: todayInTimeZone(context.organization.timezone),
      assigneeOptions,
      boardFilterAssignees,
      boardFilterLabels,
      canAssign: callerHasTaskAssignGrant(context),
      canArchive: hasPermission(context, PERMISSIONS.TASKS_DELETE),
      canManageBuckets: hasPermission(context, PERMISSIONS.WORKSPACES_MANAGE),
    };
  });

  if (!data) notFound();

  const {
    workspaceId = '',
    boards,
    activeBoard,
    buckets,
    tasks,
    hasMore,
    today,
    assigneeOptions,
    boardFilterAssignees,
    boardFilterLabels,
    canAssign,
    canArchive,
    canManageBuckets,
  } = data;

  // Server Actions
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

  async function syncAssigneesAction(
    taskId: string,
    input: { assigneeKeys?: string[]; assignAllProjectTeam?: boolean },
  ) {
    'use server';
    const { syncTaskAssigneesAction } = await import('@/app/[locale]/(app)/work/actions');
    await syncTaskAssigneesAction(taskId, input);
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
      projectId,
      boardId,
      listFilters: filters,
    });
    return { tasks: page.tasks, hasMore: page.hasMore };
  }

  const { BoardSavedViewsChrome } = await import('@/modules/tasks/ui/board-saved-views-chrome');
  const { BoardUrlFiltersBar } = await import('@/modules/tasks/ui/board-url-filters-bar');

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4">
      <BoardUrlFiltersBar
        searchParams={urlParams}
        buckets={buckets.map((b) => ({ id: b.id, name: b.name }))}
        assignees={boardFilterAssignees}
        labels={boardFilterLabels}
      />
      <BoardSavedViewsChrome searchParams={urlParams} boardId={boardId} projectId={projectId} />
    <ProjectBoardShell
      projectId={projectId}
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
        syncAssignees: syncAssigneesAction,
      }}
      assigneeOptions={assigneeOptions}
      canAssign={canAssign}
      canArchive={canArchive}
      canManageBuckets={canManageBuckets}
      today={today}
      initialHasMore={hasMore}
      loadMoreBoardTasks={loadMoreBoardTasksAction}
    />
    </div>
  );
}
