import { authorize } from '@/shared/permissions/authorize';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { resolveLinkedEmployee } from '@/modules/workforce/application/time-scope';
import { listAttendanceDays } from '@/modules/workforce';
import type { EmployeeAttendanceDayRow } from '@/modules/employee-app/domain/group-attendance-months';
import { EmployeeAttendanceHistory } from '@/modules/employee-app/ui/employee-attendance-history';
import { todayInTimeZone } from '@/shared/dates';

export default async function EmployeeAttendancePage() {
  const payload = await withOrgContext(async (context) => {
    await authorize(context, { permission: PERMISSIONS.ATTENDANCE_SELF, scope: 'self_only' });
    const employee = await resolveLinkedEmployee(context);
    if (!employee) {
      return {
        days: [] as EmployeeAttendanceDayRow[],
        locale: context.locale,
        timeZone: context.organization.timezone,
        currentMonthKey: todayInTimeZone(context.organization.timezone).slice(0, 7),
      };
    }

    const rows = await listAttendanceDays(context.db, context.organizationId, {
      employeeId: employee.id,
      limit: 400,
    });

    const days: EmployeeAttendanceDayRow[] = rows.map((day) => ({
      id: day.id,
      workDate: day.workDate,
      status: day.status,
      clockInAt: day.clockInAt?.toISOString() ?? null,
      clockOutAt: day.clockOutAt?.toISOString() ?? null,
    }));

    const today = todayInTimeZone(context.organization.timezone);

    return {
      days,
      locale: context.locale,
      timeZone: context.organization.timezone,
      currentMonthKey: today.slice(0, 7),
    };
  });

  return (
    <EmployeeAttendanceHistory
      days={payload.days}
      locale={payload.locale}
      timeZone={payload.timeZone}
      currentMonthKey={payload.currentMonthKey}
    />
  );
}
