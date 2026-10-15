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
import { resolveWorkLensCalendarQuery } from '@/modules/tasks/application/work-lens-calendar-filters';
import { listAccessibleWorkLensTasksPage } from '@/modules/tasks/application/work-lens-task-list';
import { countAccessibleWorkLensTasks } from '@/modules/tasks/application/work-lens-task-count';
import { listUnscheduledTasksPage } from '@/modules/tasks/application/list-unscheduled-tasks';
import { mapTasksToCardDataForOrg } from '@/modules/tasks/application/map-tasks-for-ui';
import { WorkLensChrome } from '@/modules/tasks/ui/work-lens-chrome';
import { TaskWorkSurfaceClient } from '@/modules/tasks/ui/task-work-surface-client';
import { serializeTaskCardsForClient } from '@/modules/tasks/ui/serialize-task-cards';
import {
  getTaskDetailAction,
  loadMoreUnscheduledTasksAction,
  updateTaskFieldsAction,
} from '../actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('calendar.pageTitle') };
}

type WorkLensPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkCalendarPage({ searchParams }: WorkLensPageProps) {
  const [params, shell, t] = await Promise.all([
    searchParams,
    getShellContext(),
    getTranslations('tasks'),
  ]);

  if (!shell?.permissions.has(PERMISSIONS.TASKS_READ) || !shell.modules.work_management) {
    notFound();
  }

  const filterQuery = compactWorkTaskQuery(params);
  const canUpdate = shell.permissions.has(PERMISSIONS.TASKS_UPDATE);

  const {
    tasks,
    unscheduledTasks,
    unscheduledHasMore,
    today,
    hasMore,
    clients,
    taskCount,
    monthKey,
    anchorFrom,
    anchorTo,
  } = await withOrgContext(async (context) => {
      const todayValue = todayInTimeZone(context.organization.timezone);
      const calendarQuery = resolveWorkLensCalendarQuery(params, todayValue);
      const lensParams = {
        ...params,
        anchorFrom: calendarQuery.anchorFrom,
        anchorTo: calendarQuery.anchorTo,
      };

      const [pageResult, totalCount, unscheduledPage, clientRows] = await Promise.all([
        listAccessibleWorkLensTasksPage(context, lensParams, {
          limit: TASK_LIST_MAX_LIMIT,
          today: todayValue,
        }),
        countAccessibleWorkLensTasks(context, lensParams),
        listUnscheduledTasksPage(context, params, { offset: 0 }),
        listClientsForOrg(context, { status: 'active', limit: 500 }).catch(() => []),
      ]);

      return {
        tasks: serializeTaskCardsForClient(
          await mapTasksToCardDataForOrg(context, pageResult.tasks),
        ),
        unscheduledTasks: serializeTaskCardsForClient(
          await mapTasksToCardDataForOrg(context, unscheduledPage.tasks),
        ),
        unscheduledHasMore: unscheduledPage.hasMore,
        hasMore: pageResult.hasMore,
        today: todayValue,
        taskCount: totalCount,
        monthKey: calendarQuery.monthKey,
        anchorFrom: calendarQuery.anchorFrom,
        anchorTo: calendarQuery.anchorTo,
        clients: clientRows.map((row) => ({ id: row.id, name: row.name })),
      };
    });

  const calendarFilterQuery = {
    ...filterQuery,
    anchorFrom,
    anchorTo,
    month: monthKey,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('calendar.pageTitle')} description={t('calendar.pageDescription')} />

      <WorkLensChrome
        searchParams={params}
        clients={clients}
        taskCount={taskCount}
        exportQuery={filterQuery}
      />

      <TaskWorkSurfaceClient
        tasks={tasks}
        unscheduledTasks={unscheduledTasks}
        unscheduledHasMore={unscheduledHasMore}
        today={today}
        hasMore={hasMore}
        viewMode="calendar"
        urlBackedFilters
        workLensFilterQuery={calendarFilterQuery}
        calendarMonthKey={monthKey}
        canScheduleTasks={canUpdate}
        loadMoreUnscheduled={loadMoreUnscheduledTasksAction}
        getTaskDetail={getTaskDetailAction}
        updateTask={updateTaskFieldsAction}
        canAssign={shell.permissions.has(PERMISSIONS.TASKS_ASSIGN)}
        canArchive={shell.permissions.has(PERMISSIONS.TASKS_DELETE)}
      />
    </div>
  );
}
