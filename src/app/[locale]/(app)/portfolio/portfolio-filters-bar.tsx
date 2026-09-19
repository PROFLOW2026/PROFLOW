'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { cn } from '@/shared/ui/cn';

interface FilterParam {
  key: string;
  label: string;
  value: string;
}

interface PortfolioFiltersBarProps {
  currentParams: Record<string, string | undefined>;
}

const WORK_KIND_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'project', label: 'Projects' },
  { value: 'job', label: 'Jobs' },
  { value: 'work_order', label: 'Work Orders' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
];

/**
 * Client-side filter bar for the portfolio page.
 * All filter changes update URL search params (server-driven, no client state).
 */
export function PortfolioFiltersBar({ currentParams }: PortfolioFiltersBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const updateParam = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams();
      // Copy existing params
      for (const [k, v] of Object.entries(currentParams)) {
        if (v && k !== key && k !== 'page') {
          params.set(k, v);
        }
      }
      // Set or clear the new param
      if (value) params.set(key, value);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, currentParams],
  );

  const activeFilterTags: FilterParam[] = [];
  if (currentParams.workKind) {
    activeFilterTags.push({ key: 'workKind', label: 'Type', value: currentParams.workKind });
  }
  if (currentParams.status) {
    activeFilterTags.push({ key: 'status', label: 'Status', value: currentParams.status });
  }
  if (currentParams.has_overdue === 'true') {
    activeFilterTags.push({ key: 'has_overdue', label: 'Has overdue tasks', value: 'true' });
  }
  if (currentParams.stale === 'true') {
    activeFilterTags.push({ key: 'stale', label: 'Stale (14d+)', value: 'true' });
  }

  const clearAll = () => {
    router.push(pathname);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Work kind filter */}
      <select
        value={currentParams.workKind ?? ''}
        onChange={(e) => updateParam('workKind', e.target.value || undefined)}
        className="rounded-md border border-[var(--pf-border)] bg-[var(--pf-bg-surface)] px-3 py-1.5 text-sm text-[var(--pf-text-primary)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--pf-ring)]"
        aria-label="Filter by work kind"
      >
        {WORK_KIND_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Status filter */}
      <select
        value={currentParams.status ?? ''}
        onChange={(e) => updateParam('status', e.target.value || undefined)}
        className="rounded-md border border-[var(--pf-border)] bg-[var(--pf-bg-surface)] px-3 py-1.5 text-sm text-[var(--pf-text-primary)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--pf-ring)]"
        aria-label="Filter by status"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Toggle: has overdue */}
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
        Has overdue
      </button>

      {/* Toggle: stale */}
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
        Stale (14d+)
      </button>

      {/* Clear all — only shown when filters are active */}
      {activeFilterTags.length > 0 && (
        <button
          type="button"
          onClick={clearAll}
          className="ml-1 rounded-md border border-[var(--pf-border)] px-3 py-1.5 text-sm text-[var(--pf-text-muted)] hover:bg-[var(--pf-bg-secondary)]"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
