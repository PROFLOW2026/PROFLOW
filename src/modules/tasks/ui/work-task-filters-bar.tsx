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
import { WORK_TASK_QUERY_KEYS } from '@/modules/tasks/domain/work-task-filter-keys';

export interface WorkTaskClientOption {
  readonly id: string;
  readonly name: string;
}

interface WorkTaskFiltersBarProps {
  currentParams: Record<string, string | undefined>;
  clients: readonly WorkTaskClientOption[];
  taskCount: number;
}

interface WorkTaskFilterDraft {
  search: string;
  status: string;
  priority: string;
  clientId: string;
  dueFrom: string;
  dueTo: string;
  overdue: boolean;
  blocked: boolean;
  noProject: boolean;
}

const FILTER_PARAM_KEYS = new Set<string>(WORK_TASK_QUERY_KEYS);

const DEFAULT_DRAFT: WorkTaskFilterDraft = {
  search: '',
  status: '',
  priority: '',
  clientId: '',
  dueFrom: '',
  dueTo: '',
  overdue: false,
  blocked: false,
  noProject: false,
};

function parseDraft(params: Record<string, string | undefined>): WorkTaskFilterDraft {
  return {
    search: params.search ?? '',
    status: params.status ?? '',
    priority: params.priority ?? '',
    clientId: params.clientId ?? '',
    dueFrom: params.dueFrom ?? '',
    dueTo: params.dueTo ?? '',
    overdue: params.overdue === 'true' || params.overdue === '1',
    blocked: params.blocked === 'true' || params.blocked === '1',
    noProject: params.noProject === 'true' || params.noProject === '1',
  };
}

function isActive(draft: WorkTaskFilterDraft): boolean {
  return (
    draft.search !== DEFAULT_DRAFT.search ||
    draft.status !== DEFAULT_DRAFT.status ||
    draft.priority !== DEFAULT_DRAFT.priority ||
    draft.clientId !== DEFAULT_DRAFT.clientId ||
    draft.dueFrom !== DEFAULT_DRAFT.dueFrom ||
    draft.dueTo !== DEFAULT_DRAFT.dueTo ||
    draft.overdue !== DEFAULT_DRAFT.overdue ||
    draft.blocked !== DEFAULT_DRAFT.blocked ||
    draft.noProject !== DEFAULT_DRAFT.noProject
  );
}

function buildQuery(draft: WorkTaskFilterDraft): URLSearchParams {
  const params = new URLSearchParams();
  if (draft.search.trim()) params.set('search', draft.search.trim());
  if (draft.status) params.set('status', draft.status);
  if (draft.priority) params.set('priority', draft.priority);
  if (draft.clientId) params.set('clientId', draft.clientId);
  if (draft.dueFrom) params.set('dueFrom', draft.dueFrom);
  if (draft.dueTo) params.set('dueTo', draft.dueTo);
  if (draft.overdue) params.set('overdue', 'true');
  if (draft.blocked) params.set('blocked', 'true');
  if (draft.noProject) params.set('noProject', 'true');
  return params;
}

function activeCountFromDraft(draft: WorkTaskFilterDraft): number {
  return [
    draft.search.trim(),
    draft.status,
    draft.priority,
    draft.clientId,
    draft.dueFrom,
    draft.dueTo,
    draft.overdue ? 'overdue' : '',
    draft.blocked ? 'blocked' : '',
    draft.noProject ? 'noProject' : '',
  ].filter(Boolean).length;
}

export function WorkTaskFiltersBar({ currentParams, clients, taskCount }: WorkTaskFiltersBarProps) {
  const t = useTranslations('tasks.workFilters');
  const tTasks = useTranslations('tasks');
  const router = useRouter();
  const pathname = usePathname();
  const applied = useMemo(() => parseDraft(currentParams), [currentParams]);
  const appliedKey = JSON.stringify(applied);

  const pushQuery = (params: URLSearchParams) => {
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <WorkTaskFilterControls
      key={appliedKey}
      applied={applied}
      clients={clients}
      taskCount={taskCount}
      onApply={(draft) => pushQuery(buildQuery(draft))}
      onClear={() => {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(currentParams)) {
          if (value && !FILTER_PARAM_KEYS.has(key)) params.set(key, value);
        }
        pushQuery(params);
      }}
      t={t}
      tTasks={tTasks}
    />
  );
}

function WorkTaskFilterControls({
  applied,
  clients,
  taskCount,
  onApply,
  onClear,
  t,
  tTasks,
}: {
  applied: WorkTaskFilterDraft;
  clients: readonly WorkTaskClientOption[];
  taskCount: number;
  onApply: (draft: WorkTaskFilterDraft) => void;
  onClear: () => void;
  t: ReturnType<typeof useTranslations<'tasks.workFilters'>>;
  tTasks: ReturnType<typeof useTranslations<'tasks'>>;
}) {
  const [draft, setDraft] = useState(applied);
  const active = isActive(applied);
  const activeCount = activeCountFromDraft(applied);

  const statusOptions = useMemo(
    () => [
      { value: '', label: tTasks('filters.allStatuses') },
      { value: 'todo', label: tTasks('status.todo') },
      { value: 'in_progress', label: tTasks('status.in_progress') },
      { value: 'in_review', label: tTasks('status.in_review') },
      { value: 'blocked', label: tTasks('status.blocked') },
      { value: 'done', label: tTasks('status.done') },
      { value: 'cancelled', label: tTasks('status.cancelled') },
    ],
    [tTasks],
  );

  const priorityOptions = useMemo(
    () => [
      { value: '', label: tTasks('filters.allPriorities') },
      { value: 'urgent', label: tTasks('priority.urgent') },
      { value: 'high', label: tTasks('priority.high') },
      { value: 'medium', label: tTasks('priority.medium') },
      { value: 'low', label: tTasks('priority.low') },
      { value: 'none', label: tTasks('priority.none') },
    ],
    [tTasks],
  );

  const summary: string[] = [];
  if (applied.search.trim()) summary.push(t('chipSearch', { value: applied.search.trim() }));
  if (applied.status) {
    summary.push(
      t('chipStatus', {
        value: tTasks(`status.${applied.status}` as 'status.todo'),
      }),
    );
  }
  if (applied.clientId) {
    const client = clients.find((row) => row.id === applied.clientId);
    summary.push(t('chipClient', { value: client?.name ?? applied.clientId }));
  }
  if (applied.overdue) summary.push(tTasks('filters.overdueOnly'));
  if (applied.blocked) summary.push(tTasks('filters.blockedOnly'));
  if (applied.noProject) summary.push(tTasks('filters.noProjectOnly'));

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
          <div className="sm:col-span-2">
            <OwnerFilterField label={tTasks('filters.search')}>
              <input
                type="search"
                value={draft.search}
                className={uwmFilterInputClass}
                placeholder={tTasks('filters.searchPlaceholder')}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, search: event.target.value }))
                }
              />
            </OwnerFilterField>
          </div>

          <OwnerFilterField label={tTasks('filters.status')}>
            <select
              value={draft.status}
              className={uwmFilterInputClass}
              onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
            >
              {statusOptions.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </OwnerFilterField>

          <OwnerFilterField label={tTasks('filters.priority')}>
            <select
              value={draft.priority}
              className={uwmFilterInputClass}
              onChange={(event) =>
                setDraft((current) => ({ ...current, priority: event.target.value }))
              }
            >
              {priorityOptions.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </OwnerFilterField>

          <OwnerFilterField label={t('client')}>
            <select
              value={draft.clientId}
              className={uwmFilterInputClass}
              onChange={(event) =>
                setDraft((current) => ({ ...current, clientId: event.target.value }))
              }
            >
              <option value="">{t('allClients')}</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </OwnerFilterField>

          <OwnerFilterField label={t('dueFrom')}>
            <input
              type="date"
              value={draft.dueFrom}
              className={uwmFilterInputClass}
              onChange={(event) => setDraft((current) => ({ ...current, dueFrom: event.target.value }))}
            />
          </OwnerFilterField>

          <OwnerFilterField label={t('dueTo')}>
            <input
              type="date"
              value={draft.dueTo}
              className={uwmFilterInputClass}
              onChange={(event) => setDraft((current) => ({ ...current, dueTo: event.target.value }))}
            />
          </OwnerFilterField>

          <OwnerFilterField label={tTasks('filters.overdueOnly')}>
            <button
              type="button"
              aria-pressed={draft.overdue}
              className={cn(
                uwmFilterInputClass,
                'justify-center text-start',
                draft.overdue &&
                  'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200',
              )}
              onClick={() => setDraft((current) => ({ ...current, overdue: !current.overdue }))}
            >
              {draft.overdue ? t('toggleOn') : t('toggleOff')}
            </button>
          </OwnerFilterField>

          <OwnerFilterField label={tTasks('filters.blockedOnly')}>
            <button
              type="button"
              aria-pressed={draft.blocked}
              className={cn(uwmFilterInputClass, 'justify-center text-start')}
              onClick={() => setDraft((current) => ({ ...current, blocked: !current.blocked }))}
            >
              {draft.blocked ? t('toggleOn') : t('toggleOff')}
            </button>
          </OwnerFilterField>

          <OwnerFilterField label={tTasks('filters.noProjectOnly')}>
            <button
              type="button"
              aria-pressed={draft.noProject}
              className={cn(uwmFilterInputClass, 'justify-center text-start')}
              onClick={() => setDraft((current) => ({ ...current, noProject: !current.noProject }))}
            >
              {draft.noProject ? t('toggleOn') : t('toggleOff')}
            </button>
          </OwnerFilterField>
        </div>
      </OwnerListFilterBar>

      <p className="px-1 text-sm font-medium text-[var(--pf-text-primary)]">
        {t('resultCount', { count: taskCount })}
      </p>
    </div>
  );
}
