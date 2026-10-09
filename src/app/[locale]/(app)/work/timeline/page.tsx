import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { listClientsForOrg } from '@/modules/clients';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates';
import { TASK_LIST_MAX_LIMIT } from '@/modules/tasks/domain/list-window';
import { compactWorkTaskQuery } from '@/modules/tasks/domain/work-task-filter-keys';
import { listAccessibleWorkLensTasksPage } from '@/modules/tasks/application/work-lens-task-list';
import { mapTasksToCardDataForOrg } from '@/modules/tasks/application/map-tasks-for-ui';
import { WorkLensChrome } from '@/modules/tasks/ui/work-lens-chrome';
import { TaskWorkSurfaceClient } from '@/modules/tasks/ui/task-work-surface-client';
import { serializeTaskCardsForClient } from '@/modules/tasks/ui/serialize-task-cards';
import { getTaskDetailAction, updateTaskFieldsAction } from '../actions';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('timeline.pageTitle') };
}

type WorkLensPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkTimelinePage({ searchParams }: WorkLensPageProps) {
  const [params, shell, t] = await Promise.all([
    searchParams,
    getShellContext(),
    getTranslations('tasks'),
  ]);

  if (!shell?.permissions.has(PERMISSIONS.TASKS_READ) || !shell.modules.work_management) {
    notFound();
  }

  const filterQuery = compactWorkTaskQuery(params);

  const { tasks, today, hasMore, clients, taskCount } = await withOrgContext(async (context) => {
    const todayValue = todayInTimeZone(context.organization.timezone);
    const pageResult = await listAccessibleWorkLensTasksPage(context, params, {
      limit: TASK_LIST_MAX_LIMIT,
      today: todayValue,
    });

    const clientRows = await listClientsForOrg(context, { status: 'active', limit: 500 }).catch(
      () => [],
    );

    return {
      tasks: serializeTaskCardsForClient(
        await mapTasksToCardDataForOrg(context, pageResult.tasks),
      ),
      hasMore: pageResult.hasMore,
      today: todayValue,
      taskCount: pageResult.tasks.length,
      clients: clientRows.map((row) => ({ id: row.id, name: row.name })),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('timeline.pageTitle')} description={t('timeline.pageDescription')} />

      <WorkLensChrome searchParams={params} clients={clients} taskCount={taskCount} />

      <TaskWorkSurfaceClient
        tasks={tasks}
        today={today}
        hasMore={hasMore}
        viewMode="timeline"
        timelineDateEdit
        urlBackedFilters
        workLensFilterQuery={filterQuery}
        getTaskDetail={getTaskDetailAction}
        updateTask={updateTaskFieldsAction}
      />
    </div>
  );
}
