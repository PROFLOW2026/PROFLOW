import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import {
  canManageAttendanceRecords,
  getAttendanceDayDetail,
  getMonthlyAttendanceGrid,
  listEmployeesForOrg,
} from '@/modules/workforce';
import { getLaborCostDefaultsForApply } from '@/modules/tenancy';
import { resolveOrgWorkWeekdays } from '@/modules/tenancy/domain/labor-cost-defaults';
import { AttendanceDayDetailPanel } from '@/modules/workforce/ui/attendance-day-detail-panel';
import { AttendanceMonthlyGrid } from '@/modules/workforce/ui/attendance-monthly-grid';
import { WorkforceSubNav } from '@/modules/workforce/ui/workforce-sub-nav';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { todayInTimeZone } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workforce' });
  return { title: t('attendance.monthlyGrid.title') };
}

export default async function AttendanceMonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    employeeId?: string;
    missingOnly?: string;
    dayId?: string;
    day?: string;
  }>;
}) {
  const [t, raw] = await Promise.all([getTranslations('workforce'), searchParams]);

  const data = await withOrgContext(async (context) => {
    if (!canManageAttendanceRecords(context)) {
      throw new AuthorizationError('attendance.manage');
    }

    const today = todayInTimeZone(context.organization.timezone);
    const yearMonth = raw.month && /^\d{4}-\d{2}$/.test(raw.month) ? raw.month : today.slice(0, 7);
    const employeeId = raw.employeeId || undefined;
    const missingOnly = raw.missingOnly === '1' || raw.missingOnly === 'true';

    const laborDefaults = await getLaborCostDefaultsForApply(context).catch(() => null);
    const workWeekdays = resolveOrgWorkWeekdays(laborDefaults);

    const [employees, grid, detail] = await Promise.all([
      listEmployeesForOrg(context, { status: 'active' })
        .then((rows) => rows.map((row) => ({ id: row.id, name: row.name })))
        .catch(() => []),
      getMonthlyAttendanceGrid(context, {
        yearMonth,
        today,
        workWeekdays,
        employeeId,
        missingOnly,
      }),
      raw.dayId ? getAttendanceDayDetail(context, raw.dayId).catch(() => null) : Promise.resolve(null),
    ]);

    return {
      employees,
      grid,
      detail,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('attendance.monthlyGrid.title')}
        description={t('attendance.monthlyGrid.description')}
        actions={
          <Link
            href="/workforce/attendance"
            className="text-sm font-medium underline-offset-2 hover:underline"
          >
            {t('attendance.todayView.tab')}
          </Link>
        }
      />

      <WorkforceSubNav active="attendance" />

      <nav className="flex flex-wrap gap-2 text-sm" aria-label={t('attendance.viewsLabel')}>
        <Link
          href="/workforce/attendance"
          className="rounded-md border border-transparent px-3 py-1.5 text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-subtle)]"
        >
          {t('attendance.todayView.tab')}
        </Link>
        <Link
          href="/workforce/attendance#attendance-history"
          className="rounded-md border border-transparent px-3 py-1.5 text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-subtle)]"
        >
          {t('attendance.list.tab')}
        </Link>
        <span className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-1.5 font-medium">
          {t('attendance.monthlyGrid.tab')}
        </span>
      </nav>

      <AttendanceMonthlyGrid
        grid={data.grid}
        employees={data.employees}
        selectedEmployeeId={raw.employeeId}
        missingOnly={raw.missingOnly === '1' || raw.missingOnly === 'true'}
        selectedDay={raw.day}
      />

      {data.detail ? <AttendanceDayDetailPanel detail={data.detail} canManage /> : null}
    </div>
  );
}
