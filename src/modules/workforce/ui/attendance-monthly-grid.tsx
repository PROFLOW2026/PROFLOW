import { getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import type { MonthlyAttendanceGrid, MonthlyCellKind } from '../application/attendance-owner-views';

interface AttendanceMonthlyGridProps {
  readonly grid: MonthlyAttendanceGrid;
  readonly employees: readonly { id: string; name: string }[];
  readonly selectedEmployeeId?: string;
  readonly missingOnly?: boolean;
  readonly selectedDay?: string;
}

const CELL_STYLES: Record<MonthlyCellKind, string> = {
  approved:
    'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
  pending:
    'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700',
  worked:
    'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
  missing:
    'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200 dark:border-red-700 font-semibold',
  dayOff:
    'bg-gray-100 text-gray-400 border-gray-200 dark:bg-gray-800/50 dark:text-gray-500 dark:border-gray-700',
  future: 'bg-[var(--pf-bg-subtle)] text-[var(--pf-text-muted)] border-[var(--pf-border-default)]',
  void: 'bg-gray-100 text-gray-400 border-gray-200 line-through dark:bg-gray-800/50 dark:text-gray-500',
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

function formatMonthTitle(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(
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
  const t = await getTranslations('workforce.attendance.monthlyGrid');
  const prevMonth = prevMonthStr(grid.yearMonth);
  const nextMonth = nextMonthStr(grid.yearMonth);

  return (
    <section className="flex flex-col gap-4">
      <form method="get" className="flex flex-col gap-3 rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
        <input type="hidden" name="month" value={grid.yearMonth} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[12rem] flex-col gap-1 text-sm">
            <span>{t('employee')}</span>
            <select
              name="employeeId"
              defaultValue={selectedEmployeeId ?? ''}
              className="h-11 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3"
            >
              <option value="">{t('allEmployees')}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="missingOnly" value="1" defaultChecked={missingOnly} />
            <span>{t('missingOnly')}</span>
          </label>
          <button
            type="submit"
            className="h-11 rounded-md border border-[var(--pf-border-strong)] px-4 text-sm font-medium"
          >
            {t('apply')}
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={monthlyHref({ yearMonth: prevMonth, employeeId: selectedEmployeeId, missingOnly })}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--pf-border-default)]"
            aria-label={t('prevMonth')}
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
          <span className="min-w-[10rem] text-center text-sm font-medium">{formatMonthTitle(grid.yearMonth)}</span>
          <Link
            href={monthlyHref({ yearMonth: nextMonth, employeeId: selectedEmployeeId, missingOnly })}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--pf-border-default)]"
            aria-label={t('nextMonth')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-[var(--pf-text-muted)]">
          <Legend color="bg-green-100 dark:bg-green-900/30" label={t('legend.approved')} />
          <Legend color="bg-amber-100 dark:bg-amber-900/30" label={t('legend.pending')} />
          <Legend color="bg-red-100 dark:bg-red-900/40" label={t('legend.missing')} />
          <Legend color="bg-gray-100 dark:bg-gray-800/50" label={t('legend.dayOff')} />
        </div>
      </div>

      {grid.rows.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--pf-border-default)]">
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
                      <div className="text-[10px] text-red-600 dark:text-red-400">
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
