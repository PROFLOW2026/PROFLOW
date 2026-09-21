import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import {
  findWorkspaceIdsByProject,
  getWorkspaceDetail,
} from '@/modules/workspaces';
// Agent A's real API
import {
  listBoards,
  listBuckets,
  listAccessibleTasks,
  createTask,
  updateTask,
  moveTaskToBucket,
  getTaskDetail,
  callerHasTaskAssignGrant,
} from '@/modules/tasks';
import { listProjectParticipantAssigneeOptions } from '@/modules/projects';
import type { CreateTaskInput } from '@/modules/tasks';
import {
  mapBoardToUiBoard,
  mapBucketToUiBucket,
} from '@/modules/tasks/ui/_task-api-stub';
import type { TaskCardData, TaskDetail } from '@/modules/tasks/ui/_task-api-stub';
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
}: {
  params: Promise<{ locale: string; projectId: string; boardId: string }>;
}) {
  const { projectId, boardId } = await params;

  const data = await withOrgContext(async (context) => {
    const workspaceIds = await findWorkspaceIdsByProject(context.db, projectId);
    if (workspaceIds.length === 0) return null;

    const primaryWsId = workspaceIds[0];
    if (!primaryWsId) return null;
    const workspace = await getWorkspaceDetail(context, primaryWsId);
    if (!workspace) return null;

    const [rawBoards, rawBuckets, rawTasks] = await Promise.all([
      listBoards(context, primaryWsId),
      listBuckets(context, boardId ?? ''),
      listAccessibleTasks(context, { boardId, projectId }),
    ]);

    const activeBoard = rawBoards.find((b) => b.id === boardId);
    if (!activeBoard) return null;

    const boards = rawBoards.map((b) => mapBoardToUiBoard(b));
    const taskCards = await mapTasksToCardDataForOrg(context, rawTasks);

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

    const assigneeOptions = callerHasTaskAssignGrant(context)
      ? (await listProjectParticipantAssigneeOptions(context, projectId)).map((option) => ({
          key: option.key,
          displayName: option.displayName,
          jobTitle: option.jobTitle,
        }))
      : [];

    return {
      workspaceId: primaryWsId,
      boards,
      activeBoard: mapBoardToUiBoard(activeBoard),
      buckets,
      tasks: taskCards,
      today: todayInTimeZone(context.organization.timezone),
      assigneeOptions,
      canAssign: callerHasTaskAssignGrant(context),
    };
  });

  if (!data) notFound();

  const {
    workspaceId = '',
    boards,
    activeBoard,
    buckets,
    tasks,
    today,
    assigneeOptions,
    canAssign,
  } = data;

  // Server Actions
  async function moveTaskAction(taskId: string, newBucketId: string, sortKey?: string) {
    'use server';
    await withOrgContext(async (ctx) => {
      await moveTaskToBucket(ctx, taskId, newBucketId, sortKey ? { sortKey } : {});
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

  return (
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
      today={today}
    />
  );
}
