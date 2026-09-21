import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { listAccessibleTasks } from '@/modules/tasks';
import { mapTasksToCardDataForOrg } from '@/modules/tasks/application/map-tasks-for-ui';
import { TaskTimelineView } from '@/modules/tasks/ui/task-timeline-view';
import { TaskWorkSurfaceClient } from '@/modules/tasks/ui/task-work-surface-client';
import { getTaskDetailAction, updateTaskFieldsAction } from '../../../work/actions';

export default async function ProjectTimelinePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const t = await getTranslations('tasks');

  const data = await withOrgContext(async (context) => {
    const rawTasks = await listAccessibleTasks(context, { projectId, limit: 500 });
    return {
      tasks: await mapTasksToCardDataForOrg(context, rawTasks),
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
        showProject={false}
        timelineDateEdit
        getTaskDetail={getTaskDetailAction}
        updateTask={updateTaskFieldsAction}
      >
        {({ filteredTasks, onOpenTask, onUpdateDueDate }) => (
          <TaskTimelineView
            tasks={filteredTasks}
            onOpenTask={onOpenTask}
            onUpdateDueDate={onUpdateDueDate}
            showProject={false}
          />
        )}
      </TaskWorkSurfaceClient>
    </div>
  );
}
