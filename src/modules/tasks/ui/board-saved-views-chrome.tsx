import { SavedListViewsBar } from '@/modules/tenancy/ui/saved-list-views-bar';
import { BOARD_TASK_QUERY_KEYS, compactBoardTaskQuery } from '../domain/board-task-filter-keys';

export async function BoardSavedViewsChrome({
  searchParams,
  boardId,
  projectId,
}: {
  searchParams: Record<string, string | string[] | undefined>;
  boardId: string;
  projectId?: string;
}) {
  const compact = compactBoardTaskQuery(searchParams);
  const currentQuery = {
    ...compact,
    boardId,
    ...(projectId ? { projectId } : {}),
  };

  return (
    <SavedListViewsBar
      listKey="tasks"
      searchParams={currentQuery}
      keys={[...BOARD_TASK_QUERY_KEYS]}
    />
  );
}
