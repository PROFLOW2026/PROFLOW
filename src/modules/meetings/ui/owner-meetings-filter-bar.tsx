'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  OwnerFilterField,
  OwnerListFilterBar,
} from '@/shared/ui/owner-list-filter-bar';
import { uwmFilterInputClass } from '@/shared/ui/uwm-surface-styles';

interface OwnerMeetingsFilterBarProps {
  readonly projectOptions: ReadonlyArray<{ id: string; displayName: string }>;
  readonly totalCount: number;
}

interface MeetingFilterDraft {
  readonly q: string;
  readonly projectId: string;
  readonly from: string;
  readonly to: string;
}

function parseDraft(params: URLSearchParams): MeetingFilterDraft {
  return {
    q: params.get('q') ?? '',
    projectId: params.get('project') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  };
}

function isActive(draft: MeetingFilterDraft, defaults: MeetingFilterDraft): boolean {
  return (
    draft.q.trim() !== defaults.q.trim() ||
    draft.projectId !== defaults.projectId ||
    draft.from !== defaults.from ||
    draft.to !== defaults.to
  );
}

export function OwnerMeetingsFilterBar({ projectOptions, totalCount }: OwnerMeetingsFilterBarProps) {
  const t = useTranslations('tasks.meetings.filters');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaults = useMemo(() => ({ q: '', projectId: '', from: '', to: '' }), []);
  const applied = useMemo(() => parseDraft(new URLSearchParams(searchParams.toString())), [searchParams]);

  return (
    <OwnerMeetingsFilterControls
      key={searchParams.toString()}
      applied={applied}
      defaults={defaults}
      projectOptions={projectOptions}
      totalCount={totalCount}
      locale={locale}
      onApply={(draft) => {
        const params = new URLSearchParams();
        if (draft.q.trim()) params.set('q', draft.q.trim());
        if (draft.projectId) params.set('project', draft.projectId);
        if (draft.from) params.set('from', draft.from);
        if (draft.to) params.set('to', draft.to);
        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
      }}
      onClear={() => router.push(pathname)}
      t={t}
    />
  );
}

function OwnerMeetingsFilterControls({
  applied,
  defaults,
  projectOptions,
  totalCount,
  locale,
  onApply,
  onClear,
  t,
}: {
  applied: MeetingFilterDraft;
  defaults: MeetingFilterDraft;
  projectOptions: ReadonlyArray<{ id: string; displayName: string }>;
  totalCount: number;
  locale: string;
  onApply: (draft: MeetingFilterDraft) => void;
  onClear: () => void;
  t: ReturnType<typeof useTranslations<'tasks.meetings.filters'>>;
}) {
  const [draft, setDraft] = useState(applied);
  const active = isActive(applied, defaults);
  const activeCount = [
    applied.q.trim(),
    applied.projectId,
    applied.from,
    applied.to,
  ].filter(Boolean).length;

  const summary: string[] = [];
  if (applied.q.trim()) summary.push(t('chipSearch', { value: applied.q.trim() }));
  if (applied.projectId) {
    const project = projectOptions.find((row) => row.id === applied.projectId);
    summary.push(t('chipProject', { value: project?.displayName ?? applied.projectId }));
  }
  if (applied.from || applied.to) {
    summary.push(t('chipDate', { from: applied.from || '…', to: applied.to || '…' }));
  }

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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <OwnerFilterField label={t('search')}>
            <input
              type="search"
              value={draft.q}
              className={uwmFilterInputClass}
              placeholder={t('searchPlaceholder')}
              onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
            />
          </OwnerFilterField>

          <OwnerFilterField label={t('project')}>
            <select
              value={draft.projectId}
              className={uwmFilterInputClass}
              onChange={(event) =>
                setDraft((current) => ({ ...current, projectId: event.target.value }))
              }
            >
              <option value="">{t('allProjects')}</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.displayName}
                </option>
              ))}
            </select>
          </OwnerFilterField>

          <OwnerFilterField label={t('dateFrom')}>
            <input
              type="date"
              value={draft.from}
              lang={locale}
              className={uwmFilterInputClass}
              onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
            />
          </OwnerFilterField>

          <OwnerFilterField label={t('dateTo')}>
            <input
              type="date"
              value={draft.to}
              lang={locale}
              className={uwmFilterInputClass}
              onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
            />
          </OwnerFilterField>
        </div>
      </OwnerListFilterBar>

      <p className="px-1 text-sm font-medium text-[var(--pf-text-primary)]">
        {t('resultCount', { count: totalCount })}
      </p>
    </div>
  );
}
