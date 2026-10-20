import { MainAppListBody, MainAppSection } from '@/components/patterns/main-app';
﻿import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { listClientsForOrg } from '@/modules/clients';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates';
import { TASK_LIST_MAX_LIMIT } from '@/modules/tasks/domain/list-window';
import { compactWorkTaskQuery, workTaskQueryString } from '@/modules/tasks/domain/work-task-filter-keys';
import { listAccessibleWorkLensTasksPage } from '@/modules/tasks/application/work-lens-task-list';
import { mapTasksToCardDataForOrg } from '@/modules/tasks/application/map-tasks-for-ui';
import { WorkLensChrome } from '@/modules/tasks/ui/work-lens-chrome';
import { serializeTaskCardsForClient } from '@/modules/tasks/ui/serialize-task-cards';
import { WorkListTableClient } from '@/modules/tasks/ui/work-list-table-client';
import {
  bulkUpdateTasksAction,
  getTaskDetailAction,
  updateTaskFieldsAction,
} from '../actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('list.pageTitle') };
}

type WorkListPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkListPage({ searchParams }: WorkListPageProps) {
  const [params, shell, t] = await Promise.all([
    searchParams,
    getShellContext(),
    getTranslations('tasks'),
  ]);

  if (!shell?.permissions.has(PERMISSIONS.TASKS_READ) || !shell.modules.work_management) {
    notFound();
  }

  const filterQuery = compactWorkTaskQuery(params);
  const archivedView = filterQuery.archived === '1' || filterQuery.archived === 'true';
  const canAssign = shell.permissions.has(PERMISSIONS.TASKS_ASSIGN);
  const canArchive = shell.permissions.has(PERMISSIONS.TASKS_DELETE);

  const { table, clients, today } = await withOrgContext(async (context) => {
    const todayLocal = todayInTimeZone(context.organization.timezone);
    const pageResult = await listAccessibleWorkLensTasksPage(context, params, {
      limit: TASK_LIST_MAX_LIMIT,
      excludeCancelled: false,
      today: todayLocal,
    });

    const clientRows = await listClientsForOrg(context, { status: 'active', limit: 500 }).catch(
      () => [],
    );

    const visible = pageResult.tasks;
    return {
      table: {
        tasks: serializeTaskCardsForClient(await mapTasksToCardDataForOrg(context, visible)),
        hasMore: pageResult.hasMore,
        nextOffset: pageResult.tasks.length,
        taskCount: visible.length,
      },
      clients: clientRows.map((row) => ({ id: row.id, name: row.name })),
      today: todayLocal,
    };
  });

  return (
    <>
      <PageHeader title={t('list.pageTitle')} />
      <MainAppSection className="w-full min-w-0">
        <MainAppListBody>
        <WorkLensChrome searchParams={params} clients={clients} taskCount={table.taskCount} />

      <WorkListTableClient
        key={workTaskQueryString(filterQuery)}
        initialTasks={table.tasks}
        hasMore={table.hasMore}
        nextOffset={table.nextOffset}
        filterQuery={filterQuery}
        today={today}
        onLoadTaskDetail={getTaskDetailAction}
        onUpdateTask={updateTaskFieldsAction}
        onBulkUpdate={bulkUpdateTasksAction}
        canAssign={canAssign}
        canArchive={canArchive}
        archivedView={archivedView}
      />
        </MainAppListBody>
      </MainAppSection>
    </>
  );
}
