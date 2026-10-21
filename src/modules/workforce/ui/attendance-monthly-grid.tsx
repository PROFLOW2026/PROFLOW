import { getLocale, getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { rtlFlipClassName } from '@/shared/i18n/ltr-island';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import type { MonthlyAttendanceGrid, MonthlyCellKind } from '../application/attendance-owner-views';
import { AttendanceMonthlyGridFilter } from './attendance-monthly-grid-filter';
import { resolveIntlLocale } from '@/shared/i18n/intl-locale';
import {
  pfStatusCellDanger,
  pfStatusCellDisabled,
  pfStatusCellInfo,
  pfStatusCellPending,
  pfStatusCellSuccess,
} from '@/shared/ui/status-cell-styles';

interface AttendanceMonthlyGridProps {
  readonly grid: MonthlyAttendanceGrid;
  readonly employees: readonly { id: string; name: string }[];
  readonly selectedEmployeeId?: string;
  readonly missingOnly?: boolean;
  readonly selectedDay?: string;
}

const CELL_STYLES: Record<MonthlyCellKind, string> = {
  approved: pfStatusCellSuccess,
  pending: pfStatusCellPending,
  worked: pfStatusCellSuccess,
  absence: pfStatusCellInfo,
  missing: `${pfStatusCellDanger} font-semibold`,
  exempt: 'border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] text-[var(--pf-text-muted)]',
  dayOff: pfStatusCellDisabled,
  future: 'border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] text-[var(--pf-text-muted)]',
  void: `${pfStatusCellDisabled} line-through`,
};

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
  return new Intl.DateTimeFormat(resolveIntlLocale(locale), { month: 'long', year: 'numeric' }).format(
    new Date(year!, month! - 1, 1),
  );
}

function monthlyHref(input: {
  yearMonth: string;
  employeeId?: string;
  missingOnly?: boolean;
  day?: string;
}): string {
  const params = new URLSearchParams();
  params.set('month', input.yearMonth);
  if (input.employeeId) params.set('employeeId', input.employeeId);
  if (input.missingOnly) params.set('missingOnly', '1');
  if (input.day) params.set('day', input.day);
  return `/workforce/attendance/monthly?${params.toString()}`;
}

export async function AttendanceMonthlyGrid({
  grid,
  employees,
  selectedEmployeeId,
  missingOnly,
  selectedDay,
}: AttendanceMonthlyGridProps) {
  const [t, locale] = await Promise.all([
    getTranslations('workforce.attendance.monthlyGrid'),
    getLocale(),
  ]);
  const prevMonth = prevMonthStr(grid.yearMonth);
  const nextMonth = nextMonthStr(grid.yearMonth);

  return (
    <section className="flex flex-col gap-4">
      <AttendanceMonthlyGridFilter
        yearMonth={grid.yearMonth}
        employees={employees}
        selectedEmployeeId={selectedEmployeeId ?? null}
        missingOnly={Boolean(missingOnly)}
        labels={{
          employee: t('employee'),
          allEmployees: t('allEmployees'),
          missingOnly: t('missingOnly'),
          apply: t('apply'),
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={monthlyHref({ yearMonth: prevMonth, employeeId: selectedEmployeeId, missingOnly })}
            className="inline-flex size-11 items-center justify-center rounded-md border border-[var(--pf-border-default)]"
            scroll={false}
            aria-label={t('prevMonth')}
          >
            <ChevronLeft className={rtlFlipClassName('size-4')} />
          </Link>
          <span className="min-w-0 text-center text-sm font-medium sm:min-w-[10rem]">{formatMonthTitle(grid.yearMonth, locale)}</span>
          <Link
            href={monthlyHref({ yearMonth: nextMonth, employeeId: selectedEmployeeId, missingOnly })}
            className="inline-flex size-11 items-center justify-center rounded-md border border-[var(--pf-border-default)]"
            scroll={false}
            aria-label={t('nextMonth')}
          >
            <ChevronRight className={rtlFlipClassName('size-4')} />
          </Link>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-[var(--pf-text-secondary)]">
          <Legend
            color="border-[var(--pf-status-success-border)] bg-[var(--pf-status-success-bg)]"
            label={t('legend.approved')}
          />
          <Legend
            color="border-[var(--pf-status-pending-border)] bg-[var(--pf-status-pending-bg)]"
            label={t('legend.pending')}
          />
          <Legend
            color="border-[var(--pf-status-danger-border)] bg-[var(--pf-status-danger-bg)]"
            label={t('legend.missing')}
          />
          <Legend
            color="border-[var(--pf-status-disabled-border)] bg-[var(--pf-status-disabled-bg)]"
            label={t('legend.dayOff')}
          />
        </div>
      </div>

      {grid.rows.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
      ) : (
        <div className="min-w-0 max-w-full overflow-x-auto rounded-xl border border-[var(--pf-border-default)]">
          <table className="min-w-max border-collapse text-xs">
            <thead>
              <tr className="bg-[var(--pf-bg-subtle)]">
                <th className="sticky start-0 z-10 bg-[var(--pf-bg-subtle)] px-2 py-2 text-start font-medium">
                  {t('employee')}
                </th>
                {grid.days.map((day) => (
                  <th key={day} className="px-1 py-2 text-center font-medium" dir="ltr">
                    {Number(day.slice(8, 10))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row) => (
                <tr key={row.employeeId} className="border-t border-[var(--pf-border-default)]">
                  <td className="sticky start-0 z-10 bg-[var(--pf-bg-surface)] whitespace-nowrap px-2 py-1 font-medium">
                    <div>{row.employeeName}</div>
                    {row.missingCount > 0 ? (
                      <div className="text-[10px] font-medium text-[var(--pf-status-danger-fg)]">
                        {t('missingCount', { count: row.missingCount })}
                      </div>
                    ) : null}
                  </td>
                  {row.cells.map((cell) => {
                    const href =
                      cell.dayId
                        ? `/workforce/attendance?dayId=${cell.dayId}&employeeId=${row.employeeId}&month=${grid.yearMonth}`
                        : `/workforce/attendance?employeeId=${row.employeeId}&workDate=${cell.workDate}&update=1&month=${grid.yearMonth}`;
                    const title = [
                      cell.workDate,
                      t(`legend.${cell.kind}`),
                      cell.projectNames.length > 0 ? cell.projectNames.join(', ') : null,
                      cell.hours != null ? `${cell.hours}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <td key={cell.workDate} className="p-0.5">
                        <Link
                          href={href}
                          title={title}
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded border',
                            CELL_STYLES[cell.kind],
                            selectedDay === cell.workDate && 'ring-2 ring-[var(--pf-action-primary)]',
                          )}
                        >
                          {cell.kind === 'missing' ? '!' : cell.hours != null ? Math.round(cell.hours) : ''}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('inline-block h-3 w-3 rounded-sm border', color)} />
      {label}
    </span>
  );
}
