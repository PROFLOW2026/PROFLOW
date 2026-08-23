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
  listAttendanceDaysForOrg,
  listEmployeesForOrg,
  listProjectsForTimeLog,
} from '@/modules/workforce';
import { getLaborCostDefaultsForApply } from '@/modules/tenancy';
import { resolveOrgWorkWeekdays } from '@/modules/tenancy/domain/labor-cost-defaults';
import { AttendanceClockPanel } from '@/modules/workforce/ui/attendance-clock-panel';
import { AttendanceDayDetailPanel } from '@/modules/workforce/ui/attendance-day-detail-panel';
import { AttendanceDaysTable } from '@/modules/workforce/ui/attendance-days-table';
import { AttendanceManualEntryForm } from '@/modules/workforce/ui/attendance-manual-entry-form';
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
import { todayInTimeZone } from '@/shared/dates';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workforce' });
  return { title: t('attendance.title') };
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
  }>;
}) {
  const [t, rawFilters] = await Promise.all([getTranslations('workforce'), searchParams]);

  const parsedFilters = attendanceFiltersSchema.safeParse({
    employeeId: rawFilters.employeeId || undefined,
    fromDate: rawFilters.fromDate || undefined,
    toDate: rawFilters.toDate || undefined,
    status:
      rawFilters.status === 'open' ||
      rawFilters.status === 'complete' ||
      rawFilters.status === 'void' ||
      rawFilters.status === 'all'
        ? rawFilters.status
        : undefined,
  });
  const filters = parsedFilters.success ? parsedFilters.data : {};
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

    const [clock, days, employees, detail, laborDefaults, projects] = await Promise.all([
      allowClock ? getAttendanceClockSurface(context) : Promise.resolve(null),
      listAttendanceDaysForOrg(context, filters),
      allowManage
        ? listEmployeesForOrg(context).then((rows) =>
            rows.map((row) => ({ id: row.id, name: row.name })),
          )
        : Promise.resolve([]),
      dayId ? getAttendanceDayDetail(context, dayId).catch(() => null) : Promise.resolve(null),
      allowManage
        ? getLaborCostDefaultsForApply(context).catch(() => null)
        : Promise.resolve(null),
      allowManage
        ? listProjectsForTimeLog(context).catch(() => [])
        : Promise.resolve([]),
    ]);

    const selectedEmployee =
      filters.employeeId != null
        ? employees.find((row) => row.id === filters.employeeId) ?? null
        : null;

    return {
      allowClock,
      allowManage,
      today,
      clock,
      days,
      employees,
      detail,
      selectedEmployee,
      defaultWeekdays: resolveOrgWorkWeekdays(laborDefaults),
      projects,
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

      <Alert tone="info">{t('attendance.scopeDisclaimer')}</Alert>

      <div className="flex flex-col gap-6">
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

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold">{t('attendance.list.title')}</h2>
            <p className="text-sm text-[var(--pf-text-muted)]">{t('attendance.list.hint')}</p>
            <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
              {t('attendance.completenessHint')}
            </p>
          </div>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <label className="flex flex-col gap-1 text-sm">
              <span>{t('attendance.filters.from')}</span>
              <input
                type="date"
                name="fromDate"
                defaultValue={filters.fromDate ?? ''}
                className="h-11 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{t('attendance.filters.to')}</span>
              <input
                type="date"
                name="toDate"
                defaultValue={filters.toDate ?? ''}
                className="h-11 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3"
              />
            </label>
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
            <button
              type="submit"
              className="h-11 rounded-md border border-[var(--pf-border-strong)] px-4 text-sm font-medium"
            >
              {t('attendance.filters.apply')}
            </button>
          </form>
          <AttendanceDaysTable days={data.days} />
        </section>
      </div>
    </div>
  );
}
