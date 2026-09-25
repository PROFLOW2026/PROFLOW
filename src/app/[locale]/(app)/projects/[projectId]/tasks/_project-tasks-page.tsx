import { getTranslations } from 'next-intl/server';
import { ListChecks } from 'lucide-react';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
// Agent A's real API
import { listAccessibleTasksPage } from '@/modules/tasks';
import { TASK_LIST_MAX_LIMIT } from '@/modules/tasks/domain/list-window';
import { mapTasksToCardDataForOrg } from '@/modules/tasks/application/map-tasks-for-ui';
import { ProjectTasksClient } from './_project-tasks-client';
import { getTaskDetailAction, updateTaskFieldsAction } from '../../../work/actions';

export default async function ProjectTasksPage({
  params,
}: {
  params: Promise<{ locale: string; projectId: string }>;
}) {
  const { projectId } = await params;
  const t = await getTranslations('tasks');

  const data = await withOrgContext(async (context) => {
    const page = await listAccessibleTasksPage(context, {
      projectId,
      limit: TASK_LIST_MAX_LIMIT,
    });
    return {
      tasks: await mapTasksToCardDataForOrg(context, page.tasks),
      hasMore: page.hasMore,
      today: todayInTimeZone(context.organization.timezone),
    };
  });

  if (!data) notFound();

  const { tasks, hasMore, today } = data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('tasks.projectTasksTitle')}
        description={t('tasks.projectTasksDescription')}
        actions={
          <Button asChild variant="primary" size="md">
            <Link href={`/projects/${projectId}/boards`}>
              {t('tasks.viewBoards')}
            </Link>
          </Button>
        }
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={t('list.empty.title')}
          description={t('list.empty.description')}
          action={
            <Button asChild variant="primary" size="md">
              <Link href={`/projects/${projectId}/boards`}>
                {t('boards.openBoard')}
              </Link>
            </Button>
          }
        />
      ) : (
        <>
        {hasMore ? (
          <p role="status" className="text-sm text-[var(--pf-text-muted)]">
            {t('list.hasMore')}
          </p>
        ) : null}
        <ProjectTasksClient
          tasks={tasks}
          projectId={projectId}
          getTaskDetail={getTaskDetailAction}
          updateTask={updateTaskFieldsAction}
          today={today}
        />
        </>
      )}
    </div>
  );
}
