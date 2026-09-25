import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext } from '@/shared/auth/session';
// Agent A's real API
import { listAccessibleTasksPage } from '@/modules/tasks';
import { TASK_LIST_MAX_LIMIT } from '@/modules/tasks/domain/list-window';
import { mapTasksToCardDataForOrg } from '@/modules/tasks/application/map-tasks-for-ui';
import { GlobalBoardView } from './_global-board-view';
import { getTaskDetailAction, loadMoreAccessibleTasksAction, updateTaskFieldsAction } from '../actions';

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

  const board = await withOrgContext(async (context) => {
    const page = await listAccessibleTasksPage(context, {
      status: 'all',
      limit: TASK_LIST_MAX_LIMIT,
    });
    const visible = page.tasks.filter((task) => task.status !== 'cancelled');
    return {
      tasks: await mapTasksToCardDataForOrg(context, visible),
      hasMore: page.hasMore,
      nextOffset: page.tasks.length,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('board.globalPageTitle')}
        description={t('board.globalPageDescription')}
      />

      <GlobalBoardView
        tasks={board.tasks}
        hasMore={board.hasMore}
        nextOffset={board.nextOffset}
        onLoadTaskDetail={getTaskDetailAction}
        onUpdateTask={updateTaskFieldsAction}
        onLoadMore={(offset) =>
          loadMoreAccessibleTasksAction({
            offset,
            limit: TASK_LIST_MAX_LIMIT,
            excludeCancelled: true,
          })
        }
      />
    </div>
  );
}
