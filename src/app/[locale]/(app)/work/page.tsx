import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getMyWorkPage } from '@/modules/tasks';
import type { MyWorkView } from '@/modules/tasks';
import { MY_WORK_VIEW_LIMIT } from '@/modules/tasks/domain/list-window';
import { mapTasksToCardDataForOrg } from '@/modules/tasks/application/map-tasks-for-ui';
import type { MyWorkItem, TaskCardData } from '@/modules/tasks/ui/_task-api-stub';
import { MyWorkView as MyWorkViewComponent } from '@/modules/tasks/ui/my-work-view';
import { getTaskDetailAction, loadMoreMyWorkAction, updateTaskFieldsAction } from './actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('myWork.pageTitle') };
}

const MY_WORK_VIEWS: MyWorkView[] = [
  'today',
  'overdue',
  'this_week',
  'upcoming',
  'waiting',
  'assigned_to_me',
  'following',
  'completed',
  'no_project',
];

/** Ensures RSC → client boundary receives only JSON-serializable task cards. */
function serializeMyWorkItems(tasks: TaskCardData[]): MyWorkItem[] {
  return tasks.map(
    (task) =>
      ({
        ...task,
        dueDate: task.dueDate ?? null,
        createdAt: String(task.createdAt),
        updatedAt: String(task.updatedAt),
      }) as MyWorkItem,
  );
}

/**
 * My Work hub — cross-project, cross-workspace, cross-board task aggregation.
 * Views: Today | Overdue | This Week | Upcoming | Waiting | Assigned to Me | Following | Completed
 */
export default async function MyWorkPage() {
  const shell = await getShellContext();

  if (!shell?.permissions.has(PERMISSIONS.TASKS_READ) || !shell.modules.work_management) {
    notFound();
  }

  const t = await getTranslations('tasks');

  const { tasksByView, hasMoreByView, today } = await withOrgContext(async (context) => {
    const results = await Promise.all(
      MY_WORK_VIEWS.map(async (view) => {
        const page = await getMyWorkPage(context, { view, limit: MY_WORK_VIEW_LIMIT });
        const items = serializeMyWorkItems(await mapTasksToCardDataForOrg(context, page.tasks));
        return [view, { items, hasMore: page.hasMore }] as const;
      }),
    );
    return {
      tasksByView: Object.fromEntries(results.map(([view, page]) => [view, page.items])) as Record<
        MyWorkView,
        MyWorkItem[]
      >,
      hasMoreByView: Object.fromEntries(results.map(([view, page]) => [view, page.hasMore])) as Record<
        MyWorkView,
        boolean
      >,
      today: todayInTimeZone(context.organization.timezone),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('myWork.pageTitle')}
        description={t('myWork.pageDescription')}
      />

      <MyWorkViewComponent
        tasksByView={tasksByView}
        hasMoreByView={hasMoreByView}
        defaultView="today"
        onLoadTaskDetail={getTaskDetailAction}
        onUpdateTask={updateTaskFieldsAction}
        onLoadMore={loadMoreMyWorkAction}
        today={today}
      />
    </div>
  );
}
