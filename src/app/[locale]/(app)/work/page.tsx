import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getMyWorkPage } from '@/modules/tasks';
import { MY_WORK_VIEW_LIMIT } from '@/modules/tasks/domain/list-window';
import { resolveMyWorkView } from '@/modules/tasks/domain/my-work-views';
import { mapTasksToCardDataForOrg } from '@/modules/tasks/application/map-tasks-for-ui';
import type { MyWorkItem, TaskCardData } from '@/modules/tasks/ui/task-api';
import { serializeTaskCardsForClient } from '@/modules/tasks/ui/serialize-task-cards';
import { MyWorkView as MyWorkViewComponent } from '@/modules/tasks/ui/my-work-view';
import { MyWorkQuickCreate } from '@/modules/tasks/ui/my-work-quick-create';
import { listWorkspaces } from '@/modules/workspaces';
import {
  createMyWorkTaskFromFabAction,
  fetchMyWorkViewAction,
  getTaskDetailAction,
  loadMoreMyWorkAction,
  updateTaskFieldsAction,
} from './actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('myWork.pageTitle') };
}

function serializeMyWorkItems(tasks: TaskCardData[]): MyWorkItem[] {
  return serializeTaskCardsForClient(tasks) as MyWorkItem[];
}

interface MyWorkPageProps {
  searchParams: Promise<{ view?: string | string[] }>;
}

/**
 * My Work hub — lazy-loads the active tab only (Planner+ scale).
 */
export default async function MyWorkPage({ searchParams }: MyWorkPageProps) {
  const shell = await getShellContext();

  if (!shell?.permissions.has(PERMISSIONS.TASKS_READ) || !shell.modules.work_management) {
    notFound();
  }

  const t = await getTranslations('tasks');
  const { view: viewParam } = await searchParams;
  const activeView = resolveMyWorkView(viewParam);

  const canCreateTask = shell.permissions.has(PERMISSIONS.TASKS_CREATE);
  let defaultWorkspaceId: string | null = null;
  if (canCreateTask) {
    try {
      const workspaces = await withOrgContext((context) => listWorkspaces(context));
      defaultWorkspaceId = workspaces[0]?.id ?? null;
    } catch {
      defaultWorkspaceId = null;
    }
  }

  const { initialTasks, hasMore, today } = await withOrgContext(async (context) => {
    const todayLocal = todayInTimeZone(context.organization.timezone);
    const page = await getMyWorkPage(context, {
      view: activeView,
      today: todayLocal,
      limit: MY_WORK_VIEW_LIMIT,
    });
    const items = serializeMyWorkItems(await mapTasksToCardDataForOrg(context, page.tasks));
    return { initialTasks: items, hasMore: page.hasMore, today: todayLocal };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('myWork.pageTitle')} description={t('myWork.pageDescription')} />

      <MyWorkViewComponent
        key={activeView}
        tasksByView={{ [activeView]: initialTasks }}
        hasMoreByView={{ [activeView]: hasMore }}
        activeView={activeView}
        onLoadTaskDetail={getTaskDetailAction}
        onUpdateTask={updateTaskFieldsAction}
        onLoadMore={loadMoreMyWorkAction}
        onFetchView={fetchMyWorkViewAction}
        today={today}
      />

      {canCreateTask && defaultWorkspaceId ? (
        <Suspense fallback={null}>
          <MyWorkQuickCreate
            canCreate
            defaultWorkspaceId={defaultWorkspaceId}
            createTask={createMyWorkTaskFromFabAction}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
