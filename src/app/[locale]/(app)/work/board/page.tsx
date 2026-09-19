import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext } from '@/shared/auth/session';
// Agent A's real API
import { listAccessibleTasks } from '@/modules/tasks';
import { mapTaskToCardData } from '@/modules/tasks/ui/_task-api-stub';
import { GlobalBoardView } from './_global-board-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('board.globalPageTitle') };
}

/**
 * Global Board page — groups ALL user-visible tasks by canonical STATUS.
 * Canonical status columns: Todo | In Progress | In Review | Blocked | Done
 *
 * This is NOT a bucket board. Bucket-specific views live in
 * /workspaces/[workspaceId]/boards/[boardId] and /projects/[projectId]/boards/[boardId].
 */
export default async function GlobalBoardPage() {
  const t = await getTranslations('tasks');

  const tasks = await withOrgContext(async (context) => {
    // 'all' fetches all statuses; UI will filter out 'cancelled' tasks for board display
    const rawTasks = await listAccessibleTasks(context, { status: 'all' });
    return rawTasks
      .filter((t) => t.status !== 'cancelled')
      .map((t) => mapTaskToCardData(t));
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('board.globalPageTitle')}
        description={t('board.globalPageDescription')}
      />

      <GlobalBoardView tasks={tasks} />
    </div>
  );
}
