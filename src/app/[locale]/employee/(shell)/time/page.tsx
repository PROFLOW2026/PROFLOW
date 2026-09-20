import { getTranslations } from 'next-intl/server';
import { AttendanceClockPanel } from '@/modules/workforce/ui/attendance-clock-panel';
import {
  clockBreakEndAction,
  clockBreakStartAction,
  clockInAction,
  clockOutAction,
} from '@/app/[locale]/(app)/workforce/attendance/actions';
import { getEmployeeShellData } from '@/modules/employee-app/application/get-employee-shell';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { authorize } from '@/shared/permissions/authorize';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { resolveLinkedEmployee } from '@/modules/workforce/application/time-scope';
import { listAttendanceDays } from '@/modules/workforce';
import type { EmployeeAttendanceDayRow } from '@/modules/employee-app/domain/group-attendance-months';
import { EmployeeAttendanceHistory } from '@/modules/employee-app/ui/employee-attendance-history';
import { todayInTimeZone } from '@/shared/dates';
import { resolveSelfScopedEmployeeId } from '@/modules/workforce/application/time-scope';
import { listTimeEntries } from '@/modules/workforce';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';

export default async function EmployeeTimePage() {
  const t = await getTranslations('employeeApp');
  const tWorkforce = await getTranslations('workforce');
  const tLists = await getTranslations('employeeApp.lists');

  const payload = await withOrgContext(async (context) => {
    const canAttendance = employeeHasPermission(context, PERMISSIONS.ATTENDANCE_SELF);
    const canHours = employeeHasPermission(context, PERMISSIONS.TIME_MANAGE);
    const shell = await getEmployeeShellData(context);

    let days: EmployeeAttendanceDayRow[] = [];
    const locale = context.locale;
    const timeZone = context.organization.timezone;
    let currentMonthKey = todayInTimeZone(timeZone).slice(0, 7);

    if (canAttendance) {
      await authorize(context, { permission: PERMISSIONS.ATTENDANCE_SELF, scope: 'self_only' });
      const employee = await resolveLinkedEmployee(context);
      if (employee) {
        const rows = await listAttendanceDays(context.db, context.organizationId, {
          employeeId: employee.id,
          limit: 400,
        });
        days = rows.map((day) => ({
          id: day.id,
          workDate: day.workDate,
          status: day.status,
          clockInAt: day.clockInAt?.toISOString() ?? null,
          clockOutAt: day.clockOutAt?.toISOString() ?? null,
        }));
        currentMonthKey = todayInTimeZone(timeZone).slice(0, 7);
      }
    }

    let entries: Array<{ id: string; workDate: string; hours: string; projectId: string | null }> = [];
    if (canHours) {
      await authorize(context, { permission: PERMISSIONS.TIME_MANAGE, scope: 'self_only' });
      const employeeId = await resolveSelfScopedEmployeeId(context);
      if (employeeId) {
        const result = await listTimeEntries(context.db, context.organizationId, { employeeId });
        entries = result.slice(0, 50).map((item) => ({
          id: item.id,
          workDate: item.workDate,
          hours: item.hours,
          projectId: item.projectId,
        }));
      }
    }

    return { canAttendance, canHours, shell, days, locale, timeZone, currentMonthKey, entries };
  });

  return (
    <div className="flex flex-col gap-8">
      {payload.canAttendance && payload.shell.clock && payload.shell.linked ? (
        <section id="attendance" className="space-y-4">
          <h2 className="text-sm font-semibold">{t('time.attendanceSection')}</h2>
          <AttendanceClockPanel
            employeeName={payload.shell.employeeName}
            workDate={payload.shell.clock.workDate}
            presence={payload.shell.clock.presence}
            canClockIn={payload.shell.clock.canClockIn}
            canClockOut={payload.shell.clock.canClockOut}
            canBreakStart={payload.shell.clock.canBreakStart}
            canBreakEnd={payload.shell.clock.canBreakEnd}
            clockInAction={clockInAction}
            clockOutAction={clockOutAction}
            clockBreakStartAction={clockBreakStartAction}
            clockBreakEndAction={clockBreakEndAction}
            linked={payload.shell.linked}
            showTimeHints={false}
            logHoursHref={payload.canHours ? '/employee/hours/new' : null}
          />
          <EmployeeAttendanceHistory
            days={payload.days}
            locale={payload.locale}
            timeZone={payload.timeZone}
            currentMonthKey={payload.currentMonthKey}
          />
        </section>
      ) : null}

      {payload.canHours ? (
        <section id="hours" className="space-y-4">
          <h2 className="text-sm font-semibold">{t('time.hoursSection')}</h2>
          <Button asChild size="lg" block>
            <Link href="/employee/hours/new">{tWorkforce('attendance.clock.logHoursLink')}</Link>
          </Button>
          <ul className="divide-y divide-[var(--pf-border)] rounded-lg border border-[var(--pf-border)]">
            {payload.entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{entry.workDate}</span>
                <span>{entry.hours}h</span>
              </li>
            ))}
            {payload.entries.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
                {tLists('hoursEmpty')}
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
