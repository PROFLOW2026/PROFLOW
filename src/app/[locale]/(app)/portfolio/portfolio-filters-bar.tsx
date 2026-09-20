'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/ui/cn';

interface FilterParam {
  key: string;
  label: string;
  value: string;
}

interface PortfolioFiltersBarProps {
  currentParams: Record<string, string | undefined>;
}

/**
 * Client-side filter bar for the portfolio page.
 * All filter changes update URL search params (server-driven, no client state).
 */
export function PortfolioFiltersBar({ currentParams }: PortfolioFiltersBarProps) {
  const t = useTranslations('tasks.portfolio.filters');
  const router = useRouter();
  const pathname = usePathname();

  const workKindOptions = useMemo(
    () => [
      { value: '', label: t('allTypes') },
      { value: 'project', label: t('workKindOptions.project') },
      { value: 'job', label: t('workKindOptions.job') },
      { value: 'work_order', label: t('workKindOptions.work_order') },
    ],
    [t],
  );

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('allStatuses') },
      { value: 'active', label: t('statusOptions.active') },
      { value: 'on_hold', label: t('statusOptions.on_hold') },
      { value: 'completed', label: t('statusOptions.completed') },
    ],
    [t],
  );

  const updateParam = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(currentParams)) {
        if (v && k !== key && k !== 'page') {
          params.set(k, v);
        }
      }
      if (value) params.set(key, value);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, currentParams],
  );

  const activeFilterTags: FilterParam[] = [];
  if (currentParams.workKind) {
    activeFilterTags.push({ key: 'workKind', label: t('workKind'), value: currentParams.workKind });
  }
  if (currentParams.status) {
    activeFilterTags.push({ key: 'status', label: t('status'), value: currentParams.status });
  }
  if (currentParams.has_overdue === 'true') {
    activeFilterTags.push({ key: 'has_overdue', label: t('hasOverdue'), value: 'true' });
  }
  if (currentParams.stale === 'true') {
    activeFilterTags.push({ key: 'stale', label: t('staleShort'), value: 'true' });
  }

  const clearAll = () => {
    router.push(pathname);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={currentParams.workKind ?? ''}
        onChange={(e) => updateParam('workKind', e.target.value || undefined)}
        className="rounded-md border border-[var(--pf-border)] bg-[var(--pf-bg-surface)] px-3 py-1.5 text-sm text-[var(--pf-text-primary)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--pf-ring)]"
        aria-label={t('aria.workKind')}
      >
        {workKindOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        value={currentParams.status ?? ''}
        onChange={(e) => updateParam('status', e.target.value || undefined)}
        className="rounded-md border border-[var(--pf-border)] bg-[var(--pf-bg-surface)] px-3 py-1.5 text-sm text-[var(--pf-text-primary)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--pf-ring)]"
        aria-label={t('aria.status')}
      >
        {statusOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() =>
          updateParam('has_overdue', currentParams.has_overdue === 'true' ? undefined : 'true')
        }
        className={cn(
          'rounded-md border px-3 py-1.5 text-sm transition-colors',
          currentParams.has_overdue === 'true'
            ? 'border-red-400 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300'
            : 'border-[var(--pf-border)] bg-[var(--pf-bg-surface)] text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-secondary)]',
        )}
      >
        {t('hasOverdue')}
      </button>

      <button
        type="button"
        onClick={() =>
          updateParam('stale', currentParams.stale === 'true' ? undefined : 'true')
        }
        className={cn(
          'rounded-md border px-3 py-1.5 text-sm transition-colors',
          currentParams.stale === 'true'
            ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300'
            : 'border-[var(--pf-border)] bg-[var(--pf-bg-surface)] text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-secondary)]',
        )}
      >
        {t('staleShort')}
      </button>

      {activeFilterTags.length > 0 && (
        <button
          type="button"
          onClick={clearAll}
          className="ml-1 rounded-md border border-[var(--pf-border)] px-3 py-1.5 text-sm text-[var(--pf-text-muted)] hover:bg-[var(--pf-bg-secondary)]"
        >
          {t('clearAll')}
        </button>
      )}
    </div>
  );
}
