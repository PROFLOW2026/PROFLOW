import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext } from '@/shared/auth/session';
// Agent A's real API
import { getMyWork } from '@/modules/tasks';
import type { MyWorkView } from '@/modules/tasks';
import { mapTaskToCardData } from '@/modules/tasks/ui/_task-api-stub';
import type { MyWorkItem } from '@/modules/tasks/ui/_task-api-stub';
import { MyWorkView as MyWorkViewComponent } from '@/modules/tasks/ui/my-work-view';

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

/**
 * My Work hub — cross-project, cross-workspace, cross-board task aggregation.
 * Views: Today | Overdue | This Week | Upcoming | Waiting | Assigned to Me | Following | Completed
 */
export default async function MyWorkPage() {
  const t = await getTranslations('tasks');

  const tasksByView = await withOrgContext(async (context) => {
    const results = await Promise.all(
      MY_WORK_VIEWS.map(async (view) => {
        const tasks = await getMyWork(context, { view, limit: 100 });
        // Map Agent A's Task[] to UI TaskCardData[] (enrichment can be added later via joins)
        const items = tasks.map((t) => mapTaskToCardData(t)) as MyWorkItem[];
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

      <MyWorkViewComponent tasksByView={tasksByView} defaultView="today" />
    </div>
  );
}
