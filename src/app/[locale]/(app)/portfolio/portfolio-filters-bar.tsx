'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  OwnerFilterField,
  OwnerListFilterBar,
} from '@/shared/ui/owner-list-filter-bar';
import { uwmFilterInputClass } from '@/shared/ui/uwm-surface-styles';
import { cn } from '@/shared/ui/cn';

interface PortfolioFiltersBarProps {
  currentParams: Record<string, string | undefined>;
  totalCount: number;
}

interface PortfolioFilterDraft {
  workKind: string;
  status: string;
  hasOverdue: boolean;
  stale: boolean;
}

function parseDraft(params: Record<string, string | undefined>): PortfolioFilterDraft {
  return {
    workKind: params.workKind ?? '',
    status: params.status ?? '',
    hasOverdue: params.has_overdue === 'true',
    stale: params.stale === 'true',
  };
}

function isActive(draft: PortfolioFilterDraft, defaults: PortfolioFilterDraft): boolean {
  return (
    draft.workKind !== defaults.workKind ||
    draft.status !== defaults.status ||
    draft.hasOverdue !== defaults.hasOverdue ||
    draft.stale !== defaults.stale
  );
}

function buildQuery(
  draft: PortfolioFilterDraft,
  currentParams: Record<string, string | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(currentParams)) {
    if (
      value &&
      key !== 'workKind' &&
      key !== 'status' &&
      key !== 'has_overdue' &&
      key !== 'stale' &&
      key !== 'page'
    ) {
      params.set(key, value);
    }
  }
  if (draft.workKind) params.set('workKind', draft.workKind);
  if (draft.status) params.set('status', draft.status);
  if (draft.hasOverdue) params.set('has_overdue', 'true');
  if (draft.stale) params.set('stale', 'true');
  return params;
}

export function PortfolioFiltersBar({ currentParams, totalCount }: PortfolioFiltersBarProps) {
  const t = useTranslations('tasks.portfolio.filters');
  const router = useRouter();
  const pathname = usePathname();
  const defaults = useMemo(
    () => ({ workKind: '', status: '', hasOverdue: false, stale: false }),
    [],
  );
  const applied = useMemo(() => parseDraft(currentParams), [currentParams]);
  const appliedKey = JSON.stringify(applied);

  return (
    <PortfolioFilterControls
      key={appliedKey}
      applied={applied}
      defaults={defaults}
      totalCount={totalCount}
      onApply={(draft) => {
        const query = buildQuery(draft, currentParams).toString();
        router.push(query ? `${pathname}?${query}` : pathname);
      }}
      onClear={() => {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(currentParams)) {
          if (
            value &&
            key !== 'workKind' &&
            key !== 'status' &&
            key !== 'has_overdue' &&
            key !== 'stale' &&
            key !== 'page'
          ) {
            params.set(key, value);
          }
        }
        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
      }}
      t={t}
    />
  );
}

function PortfolioFilterControls({
  applied,
  defaults,
  totalCount,
  onApply,
  onClear,
  t,
}: {
  applied: PortfolioFilterDraft;
  defaults: PortfolioFilterDraft;
  totalCount: number;
  onApply: (draft: PortfolioFilterDraft) => void;
  onClear: () => void;
  t: ReturnType<typeof useTranslations<'tasks.portfolio.filters'>>;
}) {
  const [draft, setDraft] = useState(applied);
  const active = isActive(applied, defaults);
  const activeCount = [
    applied.workKind,
    applied.status,
    applied.hasOverdue ? 'has_overdue' : '',
    applied.stale ? 'stale' : '',
  ].filter(Boolean).length;

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

  const summary: string[] = [];
  if (applied.workKind) {
    summary.push(
      t('chipWorkKind', {
        value: t(`workKindOptions.${applied.workKind}` as 'workKindOptions.project'),
      }),
    );
  }
  if (applied.status) {
    summary.push(
      t('chipStatus', {
        value: t(`statusOptions.${applied.status}` as 'statusOptions.active'),
      }),
    );
  }
  if (applied.hasOverdue) summary.push(t('chipHasOverdue'));
  if (applied.stale) summary.push(t('chipStale'));

  return (
    <div className="space-y-3">
      <OwnerListFilterBar
        title={t('title')}
        applyLabel={t('apply')}
        clearLabel={t('clear')}
        activeLabel={t('active')}
        mobileLabel={t('mobile')}
        mobileWithCountLabel={t('mobileWithCount', { count: activeCount })}
        activeCount={activeCount}
        isActive={active}
        activeSummary={summary}
        onApply={() => onApply(draft)}
        onClear={onClear}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <OwnerFilterField label={t('workKind')}>
            <select
              value={draft.workKind}
              className={uwmFilterInputClass}
              aria-label={t('aria.workKind')}
              onChange={(event) =>
                setDraft((current) => ({ ...current, workKind: event.target.value }))
              }
            >
              {workKindOptions.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </OwnerFilterField>

          <OwnerFilterField label={t('status')}>
            <select
              value={draft.status}
              className={uwmFilterInputClass}
              aria-label={t('aria.status')}
              onChange={(event) =>
                setDraft((current) => ({ ...current, status: event.target.value }))
              }
            >
              {statusOptions.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </OwnerFilterField>

          <OwnerFilterField label={t('hasOverdue')}>
            <button
              type="button"
              aria-pressed={draft.hasOverdue}
              className={cn(
                uwmFilterInputClass,
                'justify-center text-left',
                draft.hasOverdue &&
                  'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200',
              )}
              onClick={() =>
                setDraft((current) => ({ ...current, hasOverdue: !current.hasOverdue }))
              }
            >
              {draft.hasOverdue ? t('toggleOn') : t('toggleOff')}
            </button>
          </OwnerFilterField>

          <OwnerFilterField label={t('staleShort')}>
            <button
              type="button"
              aria-pressed={draft.stale}
              className={cn(
                uwmFilterInputClass,
                'justify-center text-left',
                draft.stale &&
                  'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200',
              )}
              onClick={() => setDraft((current) => ({ ...current, stale: !current.stale }))}
            >
              {draft.stale ? t('toggleOn') : t('toggleOff')}
            </button>
          </OwnerFilterField>
        </div>
      </OwnerListFilterBar>

      <p className="px-1 text-sm font-medium text-[var(--pf-text-primary)]">
        {t('resultCount', { count: totalCount })}
      </p>
    </div>
  );
}
