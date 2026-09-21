import { getLocale, getTranslations } from 'next-intl/server';
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
import { listAttendanceDays, listTimeEntries } from '@/modules/workforce';
import type { EmployeeAttendanceDayRow } from '@/modules/employee-app/domain/group-attendance-months';
import { EmployeeAttendanceHistory } from '@/modules/employee-app/ui/employee-attendance-history';
import { todayInTimeZone } from '@/shared/dates';
import {
  listEmployeeTeamAttendanceToday,
  listEmployeePendingTimeApprovals,
  type EmployeePendingTimeRow,
  type EmployeeTeamAttendanceRow,
} from '@/modules/employee-app/application/employee-operational';
import { loadProjectDisplayNameMap } from '@/modules/projects/application/project-display-names';
import { formatWorkHoursValue } from '@/modules/workforce/domain/format-work-hours';
import type { TimeEntryListItem } from '@/modules/workforce/domain/types';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import {
  employeeListPanelClass,
  employeeListRowClass,
  employeePageStackClass,
  employeePanelClass,
} from '@/modules/employee-app/ui/employee-surface-styles';
import { cn } from '@/shared/ui/cn';

interface EmployeeRecentTimeEntry {
  readonly id: string;
  readonly workDate: string;
  readonly hoursLabel: string;
  readonly contextLabel: string;
}

function formatEmployeeHoursLabel(
  raw: string,
  t: Awaited<ReturnType<typeof getTranslations<'employeeApp'>>>,
): string {
  const formatted = formatWorkHoursValue(raw);
  const numeric = Number(formatted);
  return t('attendance.hoursShort', { hours: Number.isFinite(numeric) ? numeric : 0 });
}

function formatRecentTimeEntryContext(
  entry: TimeEntryListItem,
  projectDisplayName: string | null,
  tWorkforce: Awaited<ReturnType<typeof getTranslations<'workforce'>>>,
): string {
  if (entry.kind === 'project') {
    return projectDisplayName ?? entry.projectName ?? tWorkforce('time.unknownProject');
  }
  if (entry.timeCodeName) return entry.timeCodeName;
  return tWorkforce('time.nonProject');
}

export default async function EmployeeTimePage() {
  const t = await getTranslations('employeeApp');
  const tWorkforce = await getTranslations('workforce');
  const tLists = await getTranslations('employeeApp.lists');
  const locale = await getLocale();

  const payload = await withOrgContext(async (context) => {
    const canAttendance = employeeHasPermission(context, PERMISSIONS.ATTENDANCE_SELF);
    const canHours = employeeHasPermission(context, PERMISSIONS.TIME_MANAGE);
    const shell = await getEmployeeShellData(context);

    let days: EmployeeAttendanceDayRow[] = [];
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

    let entries: EmployeeRecentTimeEntry[] = [];
    if (canHours) {
      await authorize(context, { permission: PERMISSIONS.TIME_MANAGE });
      const linkedEmployee = await resolveLinkedEmployee(context);
      if (linkedEmployee) {
        const result = await listTimeEntries(context.db, context.organizationId, {
          employeeId: linkedEmployee.id,
        });
        const recent = result.slice(0, 50);
        const projectIds = recent.map((item) => item.projectId).filter(Boolean) as string[];
        const projectLabels = await loadProjectDisplayNameMap(
          context.db,
          context.organizationId,
          projectIds,
        );
        entries = recent.map((item) => ({
          id: item.id,
          workDate: new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeZone: 'UTC',
          }).format(new Date(`${item.workDate}T00:00:00.000Z`)),
          hoursLabel: formatEmployeeHoursLabel(item.hours, t),
          contextLabel: formatRecentTimeEntryContext(
            item,
            item.projectId ? (projectLabels.get(item.projectId) ?? null) : null,
            tWorkforce,
          ),
        }));
      }
    }

    const canTeamAttendance = employeeHasPermission(context, PERMISSIONS.ATTENDANCE_READ);
    const canTimeApprove = employeeHasPermission(context, PERMISSIONS.TIME_APPROVE);
    let teamAttendance: EmployeeTeamAttendanceRow[] = [];
    let pendingTime: EmployeePendingTimeRow[] = [];
    if (canTeamAttendance) {
      teamAttendance = await listEmployeeTeamAttendanceToday(context);
    }
    if (canTimeApprove) {
      pendingTime = await listEmployeePendingTimeApprovals(context);
    }

    return {
      canAttendance,
      canHours,
      shell,
      days,
      locale,
      timeZone,
      currentMonthKey,
      entries,
      teamAttendance,
      pendingTime,
      canTeamAttendance,
      canTimeApprove,
    };
  });

  return (
    <div className={employeePageStackClass}>
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
        <section id="hours" className={cn(employeePanelClass, 'space-y-4')}>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">{t('time.reportHoursTitle')}</h2>
            <p className="text-xs text-[var(--pf-text-secondary)]">{t('time.reportHoursDescription')}</p>
          </div>
          <Button asChild size="lg" block>
            <Link href="/employee/hours/new">{tWorkforce('attendance.clock.logHoursLink')}</Link>
          </Button>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-secondary)]">
              {t('time.recentReportsSection')}
            </h3>
            <ul className={employeeListPanelClass}>
              {payload.entries.map((entry) => (
                <li key={entry.id} className={employeeListRowClass}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{entry.workDate}</p>
                      <p className="truncate text-xs text-[var(--pf-text-secondary)]">{entry.contextLabel}</p>
                    </div>
                    <span className="shrink-0 font-medium tabular-nums">{entry.hoursLabel}</span>
                  </div>
                </li>
              ))}
              {payload.entries.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
                  {tLists('hoursEmpty')}
                </li>
              ) : null}
            </ul>
          </div>
        </section>
      ) : null}

      {payload.canTeamAttendance ? (
        <section id="team-attendance" className="space-y-4">
          <h2 className="text-sm font-semibold">{t('time.teamAttendanceSection')}</h2>
          <ul className={employeeListPanelClass}>
            {payload.teamAttendance.map((row) => (
              <li key={`${row.employeeId}-${row.workDate}`} className={employeeListRowClass}>
                <div className="flex items-center justify-between gap-3">
                  <span>{row.employeeName}</span>
                  <span>{row.status}</span>
                </div>
              </li>
            ))}
            {payload.teamAttendance.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
                {t('time.teamAttendanceEmpty')}
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {payload.canTimeApprove ? (
        <section id="time-approve" className="space-y-4">
          <h2 className="text-sm font-semibold">{t('time.approveSection')}</h2>
          <ul className={employeeListPanelClass}>
            {payload.pendingTime.map((row) => (
              <li key={row.id} className={employeeListRowClass}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {row.employeeName} · {row.workDate}
                  </span>
                  <span>
                    {formatEmployeeHoursLabel(row.hours, t)} · {row.approvalStatus}
                  </span>
                </div>
              </li>
            ))}
            {payload.pendingTime.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
                {t('time.approveEmpty')}
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
