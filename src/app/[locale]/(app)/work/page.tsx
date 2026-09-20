import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getMyWork } from '@/modules/tasks';
import type { MyWorkView } from '@/modules/tasks';
import { mapTaskToCardData } from '@/modules/tasks/ui/_task-api-stub';
import type { MyWorkItem } from '@/modules/tasks/ui/_task-api-stub';
import { MyWorkView as MyWorkViewComponent } from '@/modules/tasks/ui/my-work-view';
import { getTaskDetailAction, updateTaskFieldsAction } from './actions';

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
];

/** Ensures RSC → client boundary receives only JSON-serializable task cards. */
function serializeMyWorkItems(tasks: ReturnType<typeof mapTaskToCardData>[]): MyWorkItem[] {
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

  const tasksByView = await withOrgContext(async (context) => {
    const { enrichTasksWithProjectDisplayNames, projectDisplayNameForTask } = await import(
      '@/modules/tasks/application/enrich-task-project-labels'
    );
    const allTasks = (
      await Promise.all(MY_WORK_VIEWS.map((view) => getMyWork(context, { view, limit: 100 })))
    ).flat();
    const labels = await enrichTasksWithProjectDisplayNames(context, allTasks);

    const results = await Promise.all(
      MY_WORK_VIEWS.map(async (view) => {
        const tasks = await getMyWork(context, { view, limit: 100 });
        const items = serializeMyWorkItems(
          tasks.map((task) =>
            mapTaskToCardData(task, {
              projectName: projectDisplayNameForTask(task, labels),
            }),
          ),
        );
        return [view, items] as const;
      }),
    );
    return Object.fromEntries(results) as Record<MyWorkView, MyWorkItem[]>;
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('myWork.pageTitle')}
        description={t('myWork.pageDescription')}
      />

      <MyWorkViewComponent
        tasksByView={tasksByView}
        defaultView="today"
        onLoadTaskDetail={getTaskDetailAction}
        onUpdateTask={updateTaskFieldsAction}
      />
    </div>
  );
}
