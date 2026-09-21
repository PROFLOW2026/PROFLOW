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
import { listAccessibleTasks } from '@/modules/tasks';
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
    const rawTasks = await listAccessibleTasks(context, { projectId });
    return {
      tasks: await mapTasksToCardDataForOrg(context, rawTasks),
      today: todayInTimeZone(context.organization.timezone),
    };
  });

  if (!data) notFound();

  const { tasks, today } = data;

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
        <ProjectTasksClient
          tasks={tasks}
          projectId={projectId}
          getTaskDetail={getTaskDetailAction}
          updateTask={updateTaskFieldsAction}
          today={today}
        />
      )}
    </div>
  );
}
