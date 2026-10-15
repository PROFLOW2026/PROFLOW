'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TaskCardData } from './task-api';
import { mergeTaskCardsById } from '../application/merge-task-cards-for-ui';

export interface BoardTaskLoadMoreProps {
  initialHasMore: boolean;
  onLoadMore: (offset: number) => Promise<{ tasks: TaskCardData[]; hasMore: boolean }>;
  onTasksAppended: (tasks: TaskCardData[]) => void;
  taskCount: number;
}

export function BoardTaskLoadMore({
  initialHasMore,
  onLoadMore,
  onTasksAppended,
  taskCount,
}: BoardTaskLoadMoreProps) {
  const t = useTranslations('tasks');
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  if (!hasMore) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p role="status" className="text-sm text-[var(--pf-text-muted)]">
        {t('list.hasMore')}
      </p>
      <button
        type="button"
        disabled={loading}
        onClick={() => {
          void (async () => {
            setLoading(true);
            try {
              const page = await onLoadMore(taskCount);
              onTasksAppended(page.tasks);
              setHasMore(page.hasMore);
            } finally {
              setLoading(false);
            }
          })();
        }}
        className="rounded-md border border-[var(--pf-border-default)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--pf-bg-subtle)] disabled:opacity-60"
      >
        {t('list.loadMore')}
      </button>
    </div>
  );
}

export { mergeTaskCardsById };
