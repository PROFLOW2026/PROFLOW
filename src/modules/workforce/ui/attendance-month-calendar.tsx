import { getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import type { AttendanceDayListItem } from '@/modules/workforce';
import type { AttendanceOutcomeListItem } from '@/modules/workforce/application/attendance-outcomes';
import type { BusinessDate } from '@/shared/dates';
import type { EmploymentRange } from '@/modules/workforce/domain/employment-active-range';
import { isWithinEmploymentRange } from '@/modules/workforce/domain/employment-active-range';

interface AttendanceMonthCalendarProps {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly yearMonth: string;
  readonly attendanceDays: readonly AttendanceDayListItem[];
  readonly attendanceOutcomes: readonly AttendanceOutcomeListItem[];
  readonly employmentRange: EmploymentRange;
  readonly defaultWeekdays: readonly number[];
  readonly today: string;
}

type DayStatus =
  | 'not_applicable'
  | 'nonWorkday'
  | 'outcome_worked'
  | 'outcome_absence_paid'
  | 'outcome_absence_unpaid'
  | 'complete'
  | 'open'
  | 'void'
  | 'missing'
  | 'future';

function getDaysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(year!, month!, 0).getDate();
}

function getFirstDayOfWeek(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(year!, month! - 1, 1).getDay();
}

function prevMonthStr(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  if (month === 1) return `${year! - 1}-12`;
  return `${year!}-${String(month! - 1).padStart(2, '0')}`;
}

function nextMonthStr(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  if (month === 12) return `${year! + 1}-01`;
  return `${year!}-${String(month! + 1).padStart(2, '0')}`;
}

function formatMonthTitle(yearMonth: string, locale: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(year!, month! - 1, 1);
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
}

function getDayStatus(
  dateStr: BusinessDate,
  today: string,
  isWorkday: boolean,
  employmentRange: EmploymentRange,
  dayMap: Map<string, AttendanceDayListItem>,
  outcomeMap: Map<string, AttendanceOutcomeListItem>,
): DayStatus {
  if (!isWithinEmploymentRange(dateStr, employmentRange)) {
    return 'not_applicable';
  }
  if (!isWorkday) return 'nonWorkday';

  const outcome = outcomeMap.get(dateStr);
  if (outcome) {
    if (outcome.outcome === 'worked') return 'outcome_worked';
    if (outcome.absenceCompensation === 'paid') return 'outcome_absence_paid';
    return 'outcome_absence_unpaid';
  }

  const record = dayMap.get(dateStr);
  if (record) {
    if (record.status === 'void') return 'void';
    if (record.status === 'complete') return 'complete';
    return 'open';
  }

  if (dateStr > today) return 'future';
  return 'missing';
}

const DAY_CELL_STYLES: Record<DayStatus, string> = {
  outcome_worked:
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800',
  outcome_absence_paid:
    'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  outcome_absence_unpaid:
    'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  complete:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  open:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700',
  void:
    'bg-gray-100 text-gray-400 dark:bg-gray-800/50 dark:text-gray-500 border-gray-200 dark:border-gray-700 line-through',
  missing:
    'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800',
  future: 'bg-[var(--pf-bg-subtle)] text-[var(--pf-text-muted)] border-[var(--pf-border-default)]',
  nonWorkday: 'bg-transparent text-[var(--pf-text-muted)] border-transparent opacity-40',
  not_applicable:
    'bg-[var(--pf-bg-muted)] text-[var(--pf-text-muted)] border-[var(--pf-border-default)] opacity-60',
};

const WEEKDAY_HEADERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;

export async function AttendanceMonthCalendar({
  employeeId,
  employeeName,
  yearMonth,
  attendanceDays,
  attendanceOutcomes,
  employmentRange,
  defaultWeekdays,
  today,
}: AttendanceMonthCalendarProps) {
  const t = await getTranslations('workforce.attendance.monthCalendar');

  const daysInMonth = getDaysInMonth(yearMonth);
  const firstDayOfWeek = getFirstDayOfWeek(yearMonth);
  const workdaySet = new Set(defaultWeekdays);

  const dayMap = new Map<string, AttendanceDayListItem>();
  for (const day of attendanceDays) {
    if (day.workDate.startsWith(yearMonth)) {
      dayMap.set(day.workDate, day);
    }
  }

  const outcomeMap = new Map<string, AttendanceOutcomeListItem>();
  for (const outcome of attendanceOutcomes) {
    outcomeMap.set(outcome.workDate, outcome);
  }

  const prevMonth = prevMonthStr(yearMonth);
  const nextMonth = nextMonthStr(yearMonth);
  const [yearNum, monthNum] = yearMonth.split('-').map(Number);
  const monthTitle = formatMonthTitle(yearMonth, 'he-IL');

  const cells: Array<{ day: number | null; dateStr: BusinessDate | null; status: DayStatus | null }> =
    [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push({ day: null, dateStr: null, status: null });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${yearMonth}-${dayStr}` as BusinessDate;
    const dayOfWeek = new Date(yearNum!, monthNum! - 1, day).getDay();
    const isWorkday = workdaySet.has(dayOfWeek);
    const status = getDayStatus(dateStr, today, isWorkday, employmentRange, dayMap, outcomeMap);
    cells.push({ day, dateStr, status });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ day: null, dateStr: null, status: null });
  }

  return (
    <div className="rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-[var(--pf-text-primary)]">{t('title')}</h3>
          <p className="text-sm text-[var(--pf-text-muted)]">{employeeName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/workforce/attendance?employeeId=${employeeId}&month=${prevMonth}`}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--pf-border-default)] text-[var(--pf-text-secondary)] transition-colors hover:bg-[var(--pf-bg-subtle)]"
            aria-label={t('prevMonth')}
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
          <span className="min-w-[10rem] text-center text-sm font-medium text-[var(--pf-text-primary)]">
            {monthTitle}
          </span>
          <Link
            href={`/workforce/attendance?employeeId=${employeeId}&month=${nextMonth}`}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--pf-border-default)] text-[var(--pf-text-secondary)] transition-colors hover:bg-[var(--pf-bg-subtle)]"
            aria-label={t('nextMonth')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        <LegendItem color="bg-green-100 dark:bg-green-900/30" label={t('worked')} />
        <LegendItem color="bg-sky-100 dark:bg-sky-900/30" label={t('absencePaid')} />
        <LegendItem color="bg-orange-100 dark:bg-orange-900/30" label={t('absenceUnpaid')} />
        <LegendItem color="bg-emerald-100 dark:bg-emerald-900/30" label={t('approved')} />
        <LegendItem color="bg-yellow-100 dark:bg-yellow-900/30" label={t('pending')} />
        <LegendItem color="bg-red-50 dark:bg-red-900/20" label={t('missing')} />
        <LegendItem color="bg-[var(--pf-bg-muted)]" label={t('notApplicable')} />
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_HEADERS.map((hdr, i) => (
          <div
            key={i}
            className={cn(
              'py-1 text-center text-xs font-medium',
              workdaySet.has(i)
                ? 'text-[var(--pf-text-secondary)]'
                : 'text-[var(--pf-text-muted)] opacity-40',
            )}
          >
            {hdr}
          </div>
        ))}

        {cells.map((cell, idx) => {
          if (!cell.day || !cell.dateStr || !cell.status) {
            return <div key={idx} className="aspect-square" />;
          }

          const isToday = cell.dateStr === today;
          const statusLabel = t(`status.${cell.status}`);

          const cellContent = (
            <div
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center rounded-md border px-0.5 text-center text-[10px] font-medium leading-tight transition-opacity',
                DAY_CELL_STYLES[cell.status],
                isToday && 'ring-2 ring-[var(--pf-action-primary)] ring-offset-1',
              )}
              title={statusLabel}
            >
              <span className="text-xs">{cell.day}</span>
              <span className="mt-0.5 line-clamp-2 max-w-full text-[9px] font-normal opacity-90">
                {cell.status === 'not_applicable' || cell.status === 'nonWorkday'
                  ? ''
                  : statusLabel}
              </span>
            </div>
          );

          if (cell.status === 'not_applicable') {
            return <div key={idx}>{cellContent}</div>;
          }

          const dayRecord = dayMap.get(cell.dateStr);
          const href = dayRecord
            ? `/workforce/attendance?dayId=${dayRecord.id}&employeeId=${employeeId}&month=${yearMonth}`
            : `/workforce/attendance?employeeId=${employeeId}&workDate=${cell.dateStr}&update=1&month=${yearMonth}`;

          return (
            <Link key={idx} href={href} className="block hover:opacity-80">
              {cellContent}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[var(--pf-text-muted)]">
      <span className={cn('inline-block h-3 w-3 rounded-sm border', color)} />
      {label}
    </span>
  );
}
