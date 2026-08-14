import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
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
} from '@/modules/workforce';
import { AttendanceClockPanel } from '@/modules/workforce/ui/attendance-clock-panel';
import { AttendanceDayDetailPanel } from '@/modules/workforce/ui/attendance-day-detail-panel';
import { AttendanceDaysTable } from '@/modules/workforce/ui/attendance-days-table';
import { AttendanceManualEntryForm } from '@/modules/workforce/ui/attendance-manual-entry-form';
import { WorkforceSubNav } from '@/modules/workforce/ui/workforce-sub-nav';
import {
  clockInAction,
  clockOutAction,
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
  }>;
}) {
  const [t, rawFilters] = await Promise.all([
    getTranslations('workforce'),
    searchParams,
  ]);

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

  const data = await withOrgContext(async (context) => {
    if (!canViewAttendance(context)) {
      throw new AuthorizationError('attendance.read | attendance.manage | attendance.self');
    }

    const allowClock = canClockAttendance(context);
    const allowManage = canManageAttendanceRecords(context);
    const today = todayInTimeZone(context.organization.timezone);

    const [clock, days, employees, detail] = await Promise.all([
      allowClock ? getAttendanceClockSurface(context) : Promise.resolve(null),
      listAttendanceDaysForOrg(context, filters),
      allowManage
        ? listEmployeesForOrg(context).then((rows) =>
            rows.map((row) => ({ id: row.id, name: row.name })),
          )
        : Promise.resolve([]),
      dayId ? getAttendanceDayDetail(context, dayId).catch(() => null) : Promise.resolve(null),
    ]);

    return { allowClock, allowManage, today, clock, days, employees, detail };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('attendance.title')}
        description={t('attendance.description')}
      />

      <WorkforceSubNav active="attendance" />

      <div className="flex flex-col gap-6">
        {data.allowClock && data.clock ? (
          <AttendanceClockPanel
            employeeName={data.clock.employeeName}
            workDate={data.clock.workDate}
            presence={data.clock.presence}
            canClockIn={data.clock.canClockIn}
            canClockOut={data.clock.canClockOut}
            linked={Boolean(data.clock.employeeId)}
            clockInAction={clockInAction}
            clockOutAction={clockOutAction}
          />
        ) : null}

        {data.detail ? (
          <AttendanceDayDetailPanel detail={data.detail} canManage={data.allowManage} />
        ) : null}

        {data.allowManage ? (
          <AttendanceManualEntryForm
            action={manualAttendanceAction}
            employees={data.employees}
            defaultDate={data.today}
          />
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
