'use client';

import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import type { TaskPriority, TaskStatus } from './task-api';
import { compactBoardTaskQuery } from '../domain/board-task-filter-keys';
import {
  assigneeKeyFromBoardQuery,
  boardQueryPatchForAssigneeKey,
} from '../domain/board-assignee-filter';

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'blocked', 'done'];
const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

export function BoardUrlFiltersBar({
  searchParams,
  buckets,
  assignees = [],
  labels = [],
}: {
  searchParams: Record<string, string | string[] | undefined>;
  buckets: readonly { id: string; name: string }[];
  assignees?: readonly { key: string; displayName: string }[];
  labels?: readonly { id: string; name: string }[];
}) {
  const t = useTranslations('tasks');
  const router = useRouter();
  const pathname = usePathname();
  const current = useMemo(() => compactBoardTaskQuery(searchParams), [searchParams]);

  const pushQuery = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = { ...current };
      for (const [key, value] of Object.entries(patch)) {
        if (!value) delete next[key];
        else next[key] = value;
      }
      const sp = new URLSearchParams(next);
      const q = sp.toString();
      router.push(q ? `${pathname}?${q}` : pathname);
    },
    [current, pathname, router],
  );

  const toggleFlag = (key: 'overdue' | 'blocked') => {
    pushQuery({ [key]: current[key] === 'true' ? undefined : 'true' });
  };

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      <select
        aria-label={t('filters.status')}
        value={current.status ?? ''}
        onChange={(e) => pushQuery({ status: e.target.value || undefined })}
        className="max-w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-1 text-xs"
      >
        <option value="">{t('filters.allStatuses')}</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(`status.${s}`)}
          </option>
        ))}
      </select>

      <select
        aria-label={t('filters.priority')}
        value={current.priority ?? ''}
        onChange={(e) => pushQuery({ priority: e.target.value || undefined })}
        className="max-w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-1 text-xs"
      >
        <option value="">{t('filters.allPriorities')}</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {t(`priority.${p}`)}
          </option>
        ))}
      </select>

      {buckets.length > 0 ? (
        <select
          aria-label={t('groupBy.bucket')}
          value={current.bucketId ?? ''}
          onChange={(e) => pushQuery({ bucketId: e.target.value || undefined })}
          className="max-w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-1 text-xs"
        >
          <option value="">{t('boardFilters.allBuckets')}</option>
          {buckets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      ) : null}

      {assignees.length > 0 ? (
        <select
          aria-label={t('boardFilters.assignee')}
          value={assigneeKeyFromBoardQuery(current)}
          onChange={(e) => pushQuery(boardQueryPatchForAssigneeKey(e.target.value || undefined))}
          className="max-w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-1 text-xs"
        >
          <option value="">{t('boardFilters.allAssignees')}</option>
          {assignees.map((a) => (
            <option key={a.key} value={a.key}>
              {a.displayName}
            </option>
          ))}
        </select>
      ) : null}

      {labels.length > 0 ? (
        <select
          aria-label={t('boardFilters.label')}
          value={current.labelId ?? ''}
          onChange={(e) => pushQuery({ labelId: e.target.value || undefined })}
          className="max-w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-1 text-xs"
        >
          <option value="">{t('boardFilters.allLabels')}</option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </select>
      ) : null}

      <button
        type="button"
        onClick={() => toggleFlag('overdue')}
        className={cn(
          'rounded-full border px-2.5 py-0.5 text-xs font-medium',
          current.overdue === 'true'
            ? 'border-[var(--pf-status-danger-border)] bg-[var(--pf-status-danger-bg)] text-[var(--pf-status-danger-fg)]'
            : 'border-[var(--pf-border-default)] text-[var(--pf-text-secondary)]',
        )}
      >
        {t('filters.overdueOnly')}
      </button>

      <button
        type="button"
        onClick={() => toggleFlag('blocked')}
        className={cn(
          'rounded-full border px-2.5 py-0.5 text-xs font-medium',
          current.blocked === 'true'
            ? 'border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] text-[var(--pf-status-warning-fg)]'
            : 'border-[var(--pf-border-default)] text-[var(--pf-text-secondary)]',
        )}
      >
        {t('filters.blockedOnly')}
      </button>

      {Object.keys(current).some((k) => !['boardId', 'projectId'].includes(k)) ? (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="text-xs text-[var(--pf-text-muted)] underline"
        >
          {t('workFilters.clear')}
        </button>
      ) : null}
    </div>
  );
}
