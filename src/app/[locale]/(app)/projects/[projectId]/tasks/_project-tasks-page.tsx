import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import {
  callerHasTaskAssignGrant,
  createTask,
  listAccessibleTasksPage,
} from '@/modules/tasks';
import { TASK_LIST_MAX_LIMIT } from '@/modules/tasks/domain/list-window';
import { mapTasksToCardDataForOrg } from '@/modules/tasks/application/map-tasks-for-ui';
import { listProjectParticipantAssigneeOptions } from '@/modules/projects';
import { findWorkspaceIdsByProject } from '@/modules/workspaces';
import type { CreateTaskInput } from '@/modules/tasks';
import type { TaskCardData } from '@/modules/tasks/ui/_task-api-stub';
import { ProjectTasksClient } from './_project-tasks-client';
import {
  getTaskDetailAction,
  syncTaskAssigneesAction,
  updateTaskFieldsAction,
} from '../../../work/actions';

export default async function ProjectTasksPage({
  params,
}: {
  params: Promise<{ locale: string; projectId: string }>;
}) {
  const { projectId } = await params;
  const t = await getTranslations('tasks');

  const data = await withOrgContext(async (context) => {
    const workspaceIds = await findWorkspaceIdsByProject(context.db, projectId);
    const workspaceId = workspaceIds[0] ?? null;
    if (!workspaceId) return null;

    const page = await listAccessibleTasksPage(context, {
      projectId,
      limit: TASK_LIST_MAX_LIMIT,
    });

    const assigneeOptions = callerHasTaskAssignGrant(context)
      ? (await listProjectParticipantAssigneeOptions(context, projectId)).map((option) => ({
          key: option.key,
          displayName: option.displayName,
          jobTitle: option.jobTitle,
        }))
      : [];

    return {
      tasks: await mapTasksToCardDataForOrg(context, page.tasks),
      hasMore: page.hasMore,
      today: todayInTimeZone(context.organization.timezone),
      workspaceId,
      assigneeOptions,
      canAssign: callerHasTaskAssignGrant(context),
    };
  });

  if (!data) notFound();

  const { tasks, hasMore, today, workspaceId, assigneeOptions, canAssign } = data;

  async function createTaskAction(formData: CreateTaskInput): Promise<TaskCardData> {
    'use server';
    return withOrgContext(async (ctx) => {
      const task = await createTask(ctx, formData);
      const cards = await mapTasksToCardDataForOrg(ctx, [task]);
      return cards[0]!;
    });
  }

  async function syncAssigneesAction(
    taskId: string,
    input: { assigneeKeys?: string[]; assignAllProjectTeam?: boolean },
  ) {
    'use server';
    await syncTaskAssigneesAction(taskId, input);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('tasks.projectTasksTitle')}
        description={t('tasks.projectTasksDescription')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary" size="md">
              <Link href={`/projects/${projectId}/boards`}>{t('tasks.viewBoards')}</Link>
            </Button>
          </div>
        }
      />

      {hasMore ? (
        <p role="status" className="text-sm text-[var(--pf-text-muted)]">
          {t('list.hasMore')}
        </p>
      ) : null}

      <ProjectTasksClient
        tasks={tasks}
        projectId={projectId}
        workspaceId={workspaceId}
        getTaskDetail={getTaskDetailAction}
        updateTask={updateTaskFieldsAction}
        createTask={createTaskAction}
        syncAssignees={syncAssigneesAction}
        assigneeOptions={assigneeOptions}
        canAssign={canAssign}
        today={today}
      />
    </div>
  );
}
