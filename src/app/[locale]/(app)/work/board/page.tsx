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
import { GlobalBoardView } from './_global-board-view';
import { serializeTaskCardsForClient } from '@/modules/tasks/ui/serialize-task-cards';
import { getTaskDetailAction, updateTaskFieldsAction } from '../actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('board.globalPageTitle') };
}

type WorkLensPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GlobalBoardPage({ searchParams }: WorkLensPageProps) {
  const [params, shell, t] = await Promise.all([
    searchParams,
    getShellContext(),
    getTranslations('tasks'),
  ]);

  if (!shell?.permissions.has(PERMISSIONS.TASKS_READ) || !shell.modules.work_management) {
    notFound();
  }

  const filterQuery = compactWorkTaskQuery(params);

  const { board, clients } = await withOrgContext(async (context) => {
    const today = todayInTimeZone(context.organization.timezone);
    const pageResult = await listAccessibleWorkLensTasksPage(context, params, {
      limit: TASK_LIST_MAX_LIMIT,
      excludeCancelled: true,
      today,
    });

    const clientRows = await listClientsForOrg(context, { status: 'active', limit: 500 }).catch(
      () => [],
    );

    const visible = pageResult.tasks;
    return {
      board: {
        tasks: serializeTaskCardsForClient(await mapTasksToCardDataForOrg(context, visible)),
        hasMore: pageResult.hasMore,
        nextOffset: pageResult.tasks.length,
        taskCount: visible.length,
      },
      clients: clientRows.map((row) => ({ id: row.id, name: row.name })),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('board.globalPageTitle')}
        description={t('board.globalPageDescription')}
      />

      <WorkLensChrome searchParams={params} clients={clients} taskCount={board.taskCount} />

      <GlobalBoardView
        tasks={board.tasks}
        hasMore={board.hasMore}
        nextOffset={board.nextOffset}
        workLensFilterQuery={filterQuery}
        loadMoreExcludeCancelled
        onLoadTaskDetail={getTaskDetailAction}
        onUpdateTask={updateTaskFieldsAction}
      />
    </div>
  );
}
