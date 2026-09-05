import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import {
  attendanceFiltersSchema,
  canClockAttendance,
  canManageAttendanceRecords,
  canViewAttendance,
  getAttendanceClockSurface,
  getAttendanceDayDetail,
  getTodayAttendanceOverview,
  listAttendanceDaysForOrg,
  listEmployeesForOrg,
  listProjectsForTimeLog,
} from '@/modules/workforce';
import { getLaborCostDefaultsForApply } from '@/modules/tenancy';
import { resolveOrgWorkWeekdays } from '@/modules/tenancy/domain/labor-cost-defaults';
import { DateRangeSelector } from '@/components/patterns/date-range-selector';
import { AttendanceClockPanel } from '@/modules/workforce/ui/attendance-clock-panel';
import { AttendanceDayDetailPanel } from '@/modules/workforce/ui/attendance-day-detail-panel';
import { AttendanceDaysTable } from '@/modules/workforce/ui/attendance-days-table';
import { AttendanceManualEntryForm } from '@/modules/workforce/ui/attendance-manual-entry-form';
import { AttendanceMonthCalendar } from '@/modules/workforce/ui/attendance-month-calendar';
import { AttendanceDailyRoster } from '@/modules/workforce/ui/attendance-daily-roster';
import { WorkforceSubNav } from '@/modules/workforce/ui/workforce-sub-nav';
import {
  clockInAction,
  clockOutAction,
  clockBreakStartAction,
  clockBreakEndAction,
  manualAttendanceAction,
} from '@/app/[locale]/(app)/workforce/attendance/actions';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { todayInTimeZone, businessDate } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workforce' });
  return { title: t('attendance.title') };
}

/** Derive YYYY-MM string for the given date or fall back to current month. */
function toYearMonth(date: string): string {
  return date.substring(0, 7);
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{
    employeeId?: string;
    fromDate?: string;
    toDate?: string;
    status?: string;
    dayId?: string;
    workDate?: string;
    update?: string;
    /** YYYY-MM — which month to show in the calendar (default: current month) */
    month?: string;
  }>;
}) {
  const [t, rawFilters] = await Promise.all([getTranslations('workforce'), searchParams]);

  const parsedFilters = attendanceFiltersSchema.safeParse({
    employeeId: rawFilters.employeeId || undefined,
    fromDate: rawFilters.fromDate || undefined,
    toDate: rawFilters.toDate || undefined,
    // Default to 'open' to exclude void records unless explicitly requested.
    status:
      rawFilters.status === 'open' ||
      rawFilters.status === 'complete' ||
      rawFilters.status === 'void' ||
      rawFilters.status === 'all'
        ? rawFilters.status
        : 'open',
  });
  const filters = parsedFilters.success ? parsedFilters.data : { status: 'open' as const };
  const dayId = rawFilters.dayId;
  const focusUpdate =
    rawFilters.update === '1' || rawFilters.update === 'true' || Boolean(rawFilters.employeeId);
  const preferredWorkDate = rawFilters.workDate || undefined;

  const data = await withOrgContext(async (context) => {
    if (!canViewAttendance(context)) {
      throw new AuthorizationError('attendance.read | attendance.manage | attendance.self');
    }

    const allowClock = canClockAttendance(context);
    const allowManage = canManageAttendanceRecords(context);
    const today = todayInTimeZone(context.organization.timezone);

    // Determine which month to show in the calendar
    const calendarMonth = rawFilters.month ?? toYearMonth(today);

    // For the calendar we load the full month of data (only when an employee is selected)
    const calendarFromDate = filters.employeeId ? businessDate(`${calendarMonth}-01`) : undefined;
    const calendarToDate = filters.employeeId
      ? businessDate(`${calendarMonth}-${String(new Date(Number(calendarMonth.split('-')[0]), Number(calendarMonth.split('-')[1]), 0).getDate()).padStart(2, '0')}`)
      : undefined;

    const [clock, days, calendarDays, employees, detail, laborDefaults, projects, todayOverview] =
      await Promise.all([
        allowClock ? getAttendanceClockSurface(context) : Promise.resolve(null),
        listAttendanceDaysForOrg(context, filters),
        // Load full-month days only when employee is selected (for calendar view)
        filters.employeeId && calendarFromDate && calendarToDate
          ? listAttendanceDaysForOrg(context, {
              employeeId: filters.employeeId,
              fromDate: calendarFromDate,
              toDate: calendarToDate,
              status: 'all',
            })
          : Promise.resolve([]),
        allowManage
          ? listEmployeesForOrg(context).then((rows) =>
              rows.map((row) => ({ id: row.id, name: row.name, status: row.status })),
            )
          : Promise.resolve([]),
        dayId ? getAttendanceDayDetail(context, dayId).catch(() => null) : Promise.resolve(null),
        allowManage
          ? getLaborCostDefaultsForApply(context).catch(() => null)
          : Promise.resolve(null),
        allowManage
          ? listProjectsForTimeLog(context).catch(() => [])
          : Promise.resolve([]),
        allowManage
          ? getTodayAttendanceOverview(context, today).catch(() => null)
          : Promise.resolve(null),
      ]);

    const selectedEmployee =
      filters.employeeId != null
        ? employees.find((row) => row.id === filters.employeeId) ?? null
        : null;

    return {
      allowClock,
      allowManage,
      today,
      calendarMonth,
      clock,
      days,
      calendarDays,
      employees,
      detail,
      selectedEmployee,
      defaultWeekdays: resolveOrgWorkWeekdays(laborDefaults),
      projects,
      todayOverview,
    };
  });

  const formDefaultDate = preferredWorkDate ?? data.detail?.workDate ?? data.today;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('attendance.title')}
        description={t('attendance.description')}
        actions={
          data.allowManage ? (
            <Button asChild size="lg">
              <a href="#update-attendance">{t('attendance.updateCta')}</a>
            </Button>
          ) : undefined
        }
      />

      <WorkforceSubNav active="attendance" />

      {data.allowManage ? (
        <nav className="flex flex-wrap gap-2 text-sm" aria-label={t('attendance.viewsLabel')}>
          <span className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-1.5 font-medium">
            {t('attendance.todayView.tab')}
          </span>
          <a
            href="#attendance-history"
            className="rounded-md border border-transparent px-3 py-1.5 text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-subtle)]"
          >
            {t('attendance.list.tab')}
          </a>
          <Link
            href="/workforce/attendance/monthly"
            className="rounded-md border border-transparent px-3 py-1.5 text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-subtle)]"
          >
            {t('attendance.monthlyGrid.tab')}
          </Link>
        </nav>
      ) : null}

      <Alert tone="info">{t('attendance.scopeDisclaimer')}</Alert>

      <div className="flex flex-col gap-6">
        {data.allowManage && data.todayOverview ? (
          <AttendanceDailyRoster overview={data.todayOverview} />
        ) : null}

        {data.allowManage ? (
          <AttendanceManualEntryForm
            action={manualAttendanceAction}
            employees={data.employees}
            projects={data.projects}
            defaultDate={formDefaultDate}
            defaultEmployeeId={filters.employeeId ?? null}
            employeeLocked={Boolean(filters.employeeId)}
            emphasize={focusUpdate}
            defaultWeekdays={data.defaultWeekdays}
          />
        ) : null}

        {data.selectedEmployee ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {t('attendance.filteredEmployee', { name: data.selectedEmployee.name })}
          </p>
        ) : null}

        {/* Feature 1: Monthly calendar — shown when an employee is selected */}
        {data.selectedEmployee && (
          <AttendanceMonthCalendar
            employeeId={data.selectedEmployee.id}
            employeeName={data.selectedEmployee.name}
            yearMonth={data.calendarMonth}
            attendanceDays={data.calendarDays}
            defaultWeekdays={data.defaultWeekdays}
            today={data.today}
          />
        )}

        {data.allowClock && data.clock && !focusUpdate ? (
          <AttendanceClockPanel
            employeeName={data.clock.employeeName}
            workDate={data.clock.workDate}
            presence={data.clock.presence}
            canClockIn={data.clock.canClockIn}
            canClockOut={data.clock.canClockOut}
            canBreakStart={data.clock.canBreakStart}
            canBreakEnd={data.clock.canBreakEnd}
            linked={Boolean(data.clock.employeeId)}
            clockInAction={clockInAction}
            clockOutAction={clockOutAction}
            clockBreakStartAction={clockBreakStartAction}
            clockBreakEndAction={clockBreakEndAction}
          />
        ) : null}

        {data.detail ? (
          <AttendanceDayDetailPanel detail={data.detail} canManage={data.allowManage} />
        ) : null}

        <section id="attendance-history" className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold">{t('attendance.list.title')}</h2>
            <p className="text-sm text-[var(--pf-text-muted)]">{t('attendance.list.hint')}</p>
            <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
              {t('attendance.completenessHint')}
            </p>
            <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('attendance.filters.workDateHint')}</p>
          </div>
          <form className="flex flex-col gap-3" method="get">
            <DateRangeSelector
              today={data.today}
              defaultFrom={filters.fromDate ?? ''}
              defaultTo={filters.toDate ?? ''}
              fromName="fromDate"
              toName="toDate"
              labels={{
                from: t('attendance.filters.from'),
                to: t('attendance.filters.to'),
              }}
            />
            <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span>{t('attendance.filters.status')}</span>
              <select
                name="status"
                defaultValue={filters.status ?? 'all'}
                className="h-11 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3"
              >
                <option value="all">{t('attendance.filters.allStatuses')}</option>
                <option value="open">{t('attendance.dayStatus.open')}</option>
                <option value="complete">{t('attendance.dayStatus.complete')}</option>
                <option value="void">{t('attendance.dayStatus.void')}</option>
              </select>
            </label>
            {filters.employeeId ? (
              <input type="hidden" name="employeeId" value={filters.employeeId} />
            ) : null}
            {rawFilters.update ? <input type="hidden" name="update" value="1" /> : null}
            {/* Preserve the month param if set */}
            {rawFilters.month ? (
              <input type="hidden" name="month" value={rawFilters.month} />
            ) : null}
            <button
              type="submit"
              className="h-11 rounded-md border border-[var(--pf-border-strong)] px-4 text-sm font-medium"
            >
              {t('attendance.filters.apply')}
            </button>
            </div>
          </form>
          <AttendanceDaysTable days={data.days} />
        </section>
      </div>
    </div>
  );
}
