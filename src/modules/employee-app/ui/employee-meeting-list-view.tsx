'use client';

import { useMemo, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/shared/ui/cn';
import {
  filterEmployeeMeetings,
  parseMeetingFilterState,
  sortEmployeeMeetings,
  meetingFilterSearchParams,
  type EmployeeMeetingListItem,
  type MeetingFilterState,
} from './employee-filter-logic';
import {
  employeeFilterBarClass,
  employeeFilterInputClass,
  employeeFilterSelectClass,
  employeeListPanelClass,
  employeeListRowClass,
} from './employee-surface-styles';

interface EmployeeMeetingListViewProps {
  readonly meetings: readonly EmployeeMeetingListItem[];
  readonly today: string;
  readonly now: string;
  readonly projectOptions: ReadonlyArray<{ id: string; displayName: string }>;
}

export function EmployeeMeetingListView({
  meetings,
  today,
  now,
  projectOptions,
}: EmployeeMeetingListViewProps) {
  const t = useTranslations('employeeApp');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const filters = useMemo(
    () => parseMeetingFilterState(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const filtered = useMemo(() => {
    const matched = filterEmployeeMeetings(meetings, filters, today as never);
    return sortEmployeeMeetings(matched, filters);
  }, [meetings, filters, today]);

  const nowMs = useMemo(() => new Date(now).getTime(), [now]);

  function applyFilters(next: MeetingFilterState) {
    const params = meetingFilterSearchParams(next);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  function updateFilter(patch: Partial<MeetingFilterState>) {
    applyFilters({ ...filters, ...patch });
  }

  return (
    <div className="space-y-4">
      <section className={employeeFilterBarClass} aria-label={t('filters.title')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FilterField label={t('filters.search')}>
            <input
              type="search"
              defaultValue={filters.query}
              placeholder={t('lists.projectSearchPlaceholder')}
              className={employeeFilterInputClass}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  updateFilter({ query: event.currentTarget.value });
                }
              }}
              onBlur={(event) => {
                if (event.target.value !== filters.query) {
                  updateFilter({ query: event.target.value });
                }
              }}
            />
          </FilterField>

          <FilterField label={t('filters.date')}>
            <select
              value={filters.date}
              className={employeeFilterSelectClass}
              onChange={(event) =>
                updateFilter({ date: event.target.value as MeetingFilterState['date'] })
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
              value={filters.projectId}
              className={employeeFilterSelectClass}
              onChange={(event) => updateFilter({ projectId: event.target.value })}
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
              value={filters.participation}
              className={employeeFilterSelectClass}
              onChange={(event) =>
                updateFilter({
                  participation: event.target.value as MeetingFilterState['participation'],
                })
              }
            >
              <option value="all">{t('filters.participationAll')}</option>
              <option value="mine">{t('filters.participationMine')}</option>
              <option value="project">{t('filters.participationProject')}</option>
            </select>
          </FilterField>
        </div>

        {filters.date === 'custom' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FilterField label={t('filters.dateFrom')}>
              <input
                type="date"
                value={filters.dateFrom}
                lang={locale}
                className={employeeFilterInputClass}
                onChange={(event) => updateFilter({ dateFrom: event.target.value })}
              />
            </FilterField>
            <FilterField label={t('filters.dateTo')}>
              <input
                type="date"
                value={filters.dateTo}
                lang={locale}
                className={employeeFilterInputClass}
                onChange={(event) => updateFilter({ dateTo: event.target.value })}
              />
            </FilterField>
          </div>
        ) : null}
      </section>

      <ul className={employeeListPanelClass}>
        {filtered.map((meeting) => {
          const when = new Date(meeting.scheduledAt);
          const isPast = when.getTime() < nowMs;
          return (
            <li key={meeting.id} className={employeeListRowClass}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-sm font-medium leading-snug">{meeting.title}</div>
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
          <li className="px-4 py-8 text-center text-sm text-[var(--pf-text-secondary)]">
            {meetings.length === 0 ? t('meetings.empty') : t('filters.emptyMeetings')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-[var(--pf-text-secondary)]">{label}</span>
      {children}
    </label>
  );
}
