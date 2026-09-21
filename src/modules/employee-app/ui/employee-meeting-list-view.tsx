'use client';

import { useMemo, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/shared/ui/cn';
import {
  countActiveMeetingFilters,
  defaultMeetingFilterState,
  filterEmployeeMeetings,
  isMeetingFilterActive,
  parseMeetingFilterState,
  sortEmployeeMeetings,
  meetingFilterSearchParams,
  type EmployeeMeetingListItem,
  type MeetingFilterState,
} from './employee-filter-logic';
import {
  employeeFilterInputClass,
  employeeFilterSelectClass,
  employeeListPanelClass,
  employeeListRowClass,
  employeePrimaryButtonClass,
} from './employee-surface-styles';
import { EmployeeListFilterBar, FilterField } from './employee-list-filter-bar';

interface EmployeeMeetingListViewProps {
  readonly meetings: readonly EmployeeMeetingListItem[];
  readonly today: string;
  readonly now: string;
  readonly projectOptions: ReadonlyArray<{ id: string; displayName: string }>;
}

function meetingTimeLabel(
  time: MeetingFilterState['date'],
  t: ReturnType<typeof useTranslations<'employeeApp.filters'>>,
): string {
  switch (time) {
    case 'today':
      return t('timeToday');
    case 'upcoming':
      return t('meetingUpcoming');
    case 'past':
      return t('meetingPast');
    case 'this_week':
      return t('timeThisWeek');
    case 'this_month':
      return t('timeThisMonth');
    case 'custom':
      return t('timeCustom');
    default:
      return t('all');
  }
}

export function EmployeeMeetingListView({
  meetings,
  today,
  now,
  projectOptions,
}: EmployeeMeetingListViewProps) {
  const t = useTranslations('employeeApp');
  const tFilters = useTranslations('employeeApp.filters');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const defaults = useMemo(() => defaultMeetingFilterState(), []);

  const appliedFilters = useMemo(
    () => parseMeetingFilterState(new URLSearchParams(searchParams.toString()), defaults),
    [searchParams, defaults],
  );

  const filtered = useMemo(() => {
    const matched = filterEmployeeMeetings(meetings, appliedFilters, today as never);
    return sortEmployeeMeetings(matched, appliedFilters);
  }, [meetings, appliedFilters, today]);

  const nowMs = useMemo(() => new Date(now).getTime(), [now]);
  const activeCount = countActiveMeetingFilters(appliedFilters, defaults);
  const isActive = isMeetingFilterActive(appliedFilters, defaults);

  function pushFilters(next: MeetingFilterState) {
    const params = meetingFilterSearchParams(next, defaults);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  function clearFilters() {
    pushFilters(defaults);
  }

  function activeSummary(): string[] {
    const chips: string[] = [];
    if (appliedFilters.date !== defaults.date) {
      chips.push(meetingTimeLabel(appliedFilters.date, tFilters));
    }
    if (appliedFilters.projectId) {
      const project = projectOptions.find((row) => row.id === appliedFilters.projectId);
      chips.push(project?.displayName ?? tFilters('project'));
    }
    if (appliedFilters.query.trim()) chips.push(appliedFilters.query.trim());
    if (appliedFilters.participation !== defaults.participation) {
      if (appliedFilters.participation === 'mine') chips.push(tFilters('participationMine'));
      else if (appliedFilters.participation === 'project') chips.push(tFilters('participationProject'));
    }
    if (appliedFilters.dateFrom || appliedFilters.dateTo) chips.push(tFilters('timeCustom'));
    return chips;
  }

  return (
    <div className="space-y-4">
      <MeetingFilterControls
        key={searchParams.toString()}
        appliedFilters={appliedFilters}
        projectOptions={projectOptions}
        onApply={pushFilters}
        onClear={clearFilters}
        activeSummary={activeSummary()}
        isActive={isActive}
        activeCount={activeCount}
      />

      <div className="px-1">
        <p className="text-sm font-medium text-[var(--pf-text-primary)]">
          {t('filters.resultCountMeetings', { count: filtered.length })}
        </p>
      </div>

      <ul className={employeeListPanelClass}>
        {filtered.map((meeting) => {
          const when = new Date(meeting.scheduledAt);
          const isPast = when.getTime() < nowMs;
          return (
            <li key={meeting.id} className={employeeListRowClass}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-sm font-semibold leading-snug text-[var(--pf-text-primary)]">
                    {meeting.title}
                  </div>
                  {meeting.projectDisplayName ? (
                    <p className="truncate text-xs text-[var(--pf-text-secondary)]">
                      {meeting.projectDisplayName}
                    </p>
                  ) : null}
                  <p className="text-xs text-[var(--pf-text-muted)]">
                    {when.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                    isPast
                      ? 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-muted)]'
                      : 'bg-[var(--pf-accent-soft)] text-[var(--pf-accent)]',
                  )}
                >
                  {isPast ? t('filters.meetingPast') : t('filters.meetingUpcoming')}
                </span>
              </div>
            </li>
          );
        })}
        {filtered.length === 0 ? (
          <li className="space-y-3 px-4 py-8 text-center">
            <p className="text-sm text-[var(--pf-text-secondary)]">
              {meetings.length === 0 ? t('meetings.empty') : t('filters.emptyMeetingsDetailed')}
            </p>
            {meetings.length > 0 && isActive ? (
              <button type="button" className={employeePrimaryButtonClass} onClick={clearFilters}>
                {t('filters.clear')}
              </button>
            ) : null}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

interface MeetingFilterControlsProps {
  readonly appliedFilters: MeetingFilterState;
  readonly projectOptions: ReadonlyArray<{ id: string; displayName: string }>;
  readonly onApply: (next: MeetingFilterState) => void;
  readonly onClear: () => void;
  readonly activeSummary: readonly string[];
  readonly isActive: boolean;
  readonly activeCount: number;
}

function MeetingFilterControls({
  appliedFilters,
  projectOptions,
  onApply,
  onClear,
  activeSummary,
  isActive,
  activeCount,
}: MeetingFilterControlsProps) {
  const t = useTranslations('employeeApp');
  const locale = useLocale();
  const [draft, setDraft] = useState<MeetingFilterState>(appliedFilters);

  return (
    <EmployeeListFilterBar
      title={t('filters.meetingsTitle')}
      activeCount={activeCount}
      isActive={isActive}
      activeSummary={activeSummary}
      onApply={() => onApply(draft)}
      onClear={onClear}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FilterField label={t('filters.search')}>
          <input
            type="search"
            value={draft.query}
            placeholder={t('lists.projectSearchPlaceholder')}
            className={employeeFilterInputClass}
            onChange={(event) => setDraft((current) => ({ ...current, query: event.target.value }))}
          />
        </FilterField>

        <FilterField label={t('filters.date')}>
          <select
            value={draft.date}
            className={employeeFilterSelectClass}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                date: event.target.value as MeetingFilterState['date'],
              }))
            }
          >
            <option value="upcoming">{t('filters.meetingUpcoming')}</option>
            <option value="today">{t('filters.timeToday')}</option>
            <option value="past">{t('filters.meetingPast')}</option>
            <option value="this_week">{t('filters.timeThisWeek')}</option>
            <option value="this_month">{t('filters.timeThisMonth')}</option>
            <option value="custom">{t('filters.timeCustom')}</option>
            <option value="all">{t('filters.all')}</option>
          </select>
        </FilterField>

        <FilterField label={t('filters.project')}>
          <select
            value={draft.projectId}
            className={employeeFilterSelectClass}
            onChange={(event) =>
              setDraft((current) => ({ ...current, projectId: event.target.value }))
            }
          >
            <option value="">{t('filters.allProjects')}</option>
            {projectOptions.map((project) => (
              <option key={project.id} value={project.id}>
                {project.displayName}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label={t('filters.participation')}>
          <select
            value={draft.participation}
            className={employeeFilterSelectClass}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                participation: event.target.value as MeetingFilterState['participation'],
              }))
            }
          >
            <option value="all">{t('filters.participationAll')}</option>
            <option value="mine">{t('filters.participationMine')}</option>
            <option value="project">{t('filters.participationProject')}</option>
          </select>
        </FilterField>
      </div>

      {draft.date === 'custom' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FilterField label={t('filters.dateFrom')}>
            <input
              type="date"
              value={draft.dateFrom}
              lang={locale}
              className={employeeFilterInputClass}
              onChange={(event) =>
                setDraft((current) => ({ ...current, dateFrom: event.target.value }))
              }
            />
          </FilterField>
          <FilterField label={t('filters.dateTo')}>
            <input
              type="date"
              value={draft.dateTo}
              lang={locale}
              className={employeeFilterInputClass}
              onChange={(event) =>
                setDraft((current) => ({ ...current, dateTo: event.target.value }))
              }
            />
          </FilterField>
        </div>
      ) : null}
    </EmployeeListFilterBar>
  );
}
