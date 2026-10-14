'use client';

import { useState } from 'react';
import { loadMoreWorkLensTasksAction } from '@/app/[locale]/(app)/work/actions';
import type { TaskCardData, TaskDetail } from './task-api';
import { TaskTableView } from './task-table-view';

export interface WorkListTableClientProps {
  initialTasks: TaskCardData[];
  hasMore: boolean;
  nextOffset: number;
  filterQuery: Record<string, string>;
  today: string;
  onLoadTaskDetail: (taskId: string) => Promise<TaskDetail | null>;
  onUpdateTask: (
    taskId: string,
    data: Record<string, unknown>,
  ) => Promise<{ error?: string; success?: boolean }>;
  onBulkUpdate: (
    taskIds: string[],
    patch: Record<string, unknown>,
  ) => Promise<{ updated: number; failed: readonly { id: string; reason: string }[] }>;
}

export function WorkListTableClient({
  initialTasks,
  hasMore: initialHasMore,
  nextOffset: initialNextOffset,
  filterQuery,
  today,
  onLoadTaskDetail,
  onUpdateTask,
  onBulkUpdate,
}: WorkListTableClientProps) {
  const [tasks, setTasks] = useState(initialTasks);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [offset, setOffset] = useState(initialNextOffset);

  return (
    <TaskTableView
      tasks={tasks}
      hasMore={hasMore}
      today={today}
      onLoadTaskDetail={onLoadTaskDetail}
      onUpdateTask={onUpdateTask}
      onBulkUpdate={onBulkUpdate}
      onTaskPatched={(taskId, patch) => {
        setTasks((prev) => prev.map((row) => (row.id === taskId ? { ...row, ...patch } : row)));
      }}
      onLoadMore={async () => {
        const page = await loadMoreWorkLensTasksAction(offset, filterQuery);
        setTasks((prev) => [...prev, ...page.tasks]);
        setHasMore(page.hasMore);
        setOffset(page.nextOffset);
      }}
    />
  );
}
