'use client';

import { useTranslations } from 'next-intl';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import type { AttendanceDayStatus } from '@/modules/workforce';
import {
  groupEmployeeAttendanceByMonth,
  type EmployeeAttendanceDayRow,
} from '../domain/group-attendance-months';

interface Props {
  readonly days: readonly EmployeeAttendanceDayRow[];
  readonly locale: string;
  readonly timeZone: string;
  readonly currentMonthKey: string;
}

function formatWorkDate(workDate: string, locale: string): string {
  const parts = workDate.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) return workDate;
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatClockTime(iso: string | null, locale: string, timeZone: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en' : 'he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

function formatHoursTotal(hours: number, locale: string): string {
  const rounded = Math.round(hours * 10) / 10;
  return locale === 'en' ? `${rounded} h` : `${rounded} ש'`;
}

function dayHoursLabel(
  clockInAt: string | null,
  clockOutAt: string | null,
  locale: string,
): string {
  if (!clockInAt || !clockOutAt) return '—';
  const start = new Date(clockInAt).getTime();
  const end = new Date(clockOutAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '—';
  const hours = (end - start) / (1000 * 60 * 60);
  return formatHoursTotal(hours, locale);
}

export function EmployeeAttendanceHistory({
  days,
  locale,
  timeZone,
  currentMonthKey,
}: Props) {
  const t = useTranslations('employeeApp.attendance');
  const groups = groupEmployeeAttendanceByMonth(days, locale, timeZone);

  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-[var(--pf-border)] px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
        {t('empty')}
      </p>
    );
  }

  function statusLabel(status: AttendanceDayStatus): string {
    return t(`dayStatus.${status}`);
  }

  return (
    <div className="flex flex-col gap-3" data-pf-employee-attendance-history>
      {groups.map((group) => {
        const summaryParts = [t('monthDayCount', { count: group.dayCount })];
        if (group.totalHours != null) {
          summaryParts.push(t('monthHoursTotal', { hours: formatHoursTotal(group.totalHours, locale) }));
        }

        return (
          <CollapsibleSection
            key={group.monthKey}
            title={group.monthLabel}
            summary={summaryParts.join(' · ')}
            defaultOpen={group.monthKey === currentMonthKey}
          >
            <ul className="divide-y divide-[var(--pf-border)] rounded-lg border border-[var(--pf-border)]">
              {group.days.map((day) => (
                <li key={day.id} className="space-y-2 px-3 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium">{formatWorkDate(day.workDate, locale)}</span>
                    <span className="shrink-0 text-[var(--pf-text-secondary)]">
                      {statusLabel(day.status)}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[var(--pf-text-secondary)]">
                    <div>
                      <dt className="inline">{t('clockIn')}: </dt>
                      <dd className="inline text-[var(--pf-text-primary)]">
                        {formatClockTime(day.clockInAt, locale, timeZone)}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">{t('clockOut')}: </dt>
                      <dd className="inline text-[var(--pf-text-primary)]">
                        {formatClockTime(day.clockOutAt, locale, timeZone)}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="inline">{t('totalHours')}: </dt>
                      <dd className="inline text-[var(--pf-text-primary)]">
                        {dayHoursLabel(day.clockInAt, day.clockOutAt, locale)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        );
      })}
    </div>
  );
}
