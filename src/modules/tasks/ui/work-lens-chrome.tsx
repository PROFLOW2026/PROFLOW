import { SavedListViewsBar } from '@/modules/tenancy/ui/saved-list-views-bar';
import { WORK_TASK_QUERY_KEYS, compactWorkTaskQuery } from '@/modules/tasks/domain/work-task-filter-keys';
import { WorkTaskFiltersBar, type WorkTaskClientOption } from './work-task-filters-bar';

interface WorkLensChromeProps {
  searchParams: Record<string, string | string[] | undefined>;
  clients: readonly WorkTaskClientOption[];
  taskCount: number;
}

export function WorkLensChrome({ searchParams, clients, taskCount }: WorkLensChromeProps) {
  const compact = compactWorkTaskQuery(searchParams);
  const barParams = Object.fromEntries(
    WORK_TASK_QUERY_KEYS.map((key) => [key, compact[key]]),
  ) as Record<string, string | undefined>;

  return (
    <>
      <WorkTaskFiltersBar currentParams={barParams} clients={clients} taskCount={taskCount} />
      <SavedListViewsBar listKey="tasks" searchParams={barParams} keys={[...WORK_TASK_QUERY_KEYS]} />
    </>
  );
}
