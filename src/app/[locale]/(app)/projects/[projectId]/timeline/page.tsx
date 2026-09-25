import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { listAccessibleTasksPage } from '@/modules/tasks';
import { TASK_LIST_MAX_LIMIT } from '@/modules/tasks/domain/list-window';
import { mapTasksToCardDataForOrg } from '@/modules/tasks/application/map-tasks-for-ui';
import { TaskWorkSurfaceClient } from '@/modules/tasks/ui/task-work-surface-client';
import {
  getTaskDetailAction,
  loadMoreAccessibleTasksAction,
  updateTaskFieldsAction,
} from '../../../work/actions';

export default async function ProjectTimelinePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const t = await getTranslations('tasks');

  const data = await withOrgContext(async (context) => {
    const page = await listAccessibleTasksPage(context, { projectId, limit: TASK_LIST_MAX_LIMIT });
    return {
      tasks: await mapTasksToCardDataForOrg(context, page.tasks),
      hasMore: page.hasMore,
      today: todayInTimeZone(context.organization.timezone),
    };
  });

  if (!data) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('timeline.projectPageTitle')}
        description={t('timeline.projectPageDescription')}
      />

      <TaskWorkSurfaceClient
        tasks={data.tasks}
        today={data.today}
        hasMore={data.hasMore}
        viewMode="timeline"
        showProject={false}
        timelineDateEdit
        getTaskDetail={getTaskDetailAction}
        updateTask={updateTaskFieldsAction}
        onLoadMore={(offset) =>
          loadMoreAccessibleTasksAction({ offset, projectId, limit: TASK_LIST_MAX_LIMIT })
        }
      />
    </div>
  );
}
