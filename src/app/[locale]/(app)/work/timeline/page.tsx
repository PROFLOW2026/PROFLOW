import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates';
import { listAccessibleTasksPage } from '@/modules/tasks';
import { TASK_LIST_MAX_LIMIT } from '@/modules/tasks/domain/list-window';
import { mapTasksToCardDataForOrg } from '@/modules/tasks/application/map-tasks-for-ui';
import { TaskWorkSurfaceClient } from '@/modules/tasks/ui/task-work-surface-client';
import { getTaskDetailAction, loadMoreAccessibleTasksAction, updateTaskFieldsAction } from '../actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('timeline.pageTitle') };
}

export default async function WorkTimelinePage() {
  const shell = await getShellContext();
  if (!shell?.permissions.has(PERMISSIONS.TASKS_READ) || !shell.modules.work_management) {
    notFound();
  }

  const t = await getTranslations('tasks');

  const { tasks, today, hasMore } = await withOrgContext(async (context) => {
    const page = await listAccessibleTasksPage(context, { limit: TASK_LIST_MAX_LIMIT });
    return {
      tasks: await mapTasksToCardDataForOrg(context, page.tasks),
      hasMore: page.hasMore,
      today: todayInTimeZone(context.organization.timezone),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('timeline.pageTitle')} description={t('timeline.pageDescription')} />

      <TaskWorkSurfaceClient
        tasks={tasks}
        today={today}
        hasMore={hasMore}
        viewMode="timeline"
        timelineDateEdit
        getTaskDetail={getTaskDetailAction}
        updateTask={updateTaskFieldsAction}
        onLoadMore={(offset) => loadMoreAccessibleTasksAction({ offset, limit: TASK_LIST_MAX_LIMIT })}
      />
    </div>
  );
}
