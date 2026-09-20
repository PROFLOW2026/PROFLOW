import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AttendanceClockPanel } from '@/modules/workforce/ui/attendance-clock-panel';
import {
  clockBreakEndAction,
  clockBreakStartAction,
  clockInAction,
  clockOutAction,
} from '@/app/[locale]/(app)/workforce/attendance/actions';
import { getEmployeeShellData } from '@/modules/employee-app/application/get-employee-shell';
import { getEmployeePmTaskWorkSummary } from '@/modules/employee-app/application/employee-pm-tasks';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { pressableCardLinkClassName } from '@/components/ui/pressable';
import { EmployeeInstallButton } from '@/modules/employee-app/ui/employee-install-button';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'employeeApp' });
  return { title: t('title') };
}

export default async function EmployeeHomePage() {
  const t = await getTranslations('employeeApp');
  const { data, canAttendance, canLogTime, taskSummary } = await withOrgContext(async (context) => ({
    data: await getEmployeeShellData(context),
    canAttendance: employeeHasPermission(context, PERMISSIONS.ATTENDANCE_SELF),
    canLogTime: employeeHasPermission(context, PERMISSIONS.TIME_MANAGE),
    taskSummary: employeeHasPermission(context, PERMISSIONS.TASKS_READ)
      ? await getEmployeePmTaskWorkSummary(context)
      : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">
          {t('greeting', { name: data.employeeName || t('home.anonymousName') })}
        </h1>
      </header>

      <EmployeeInstallButton />

      {data.clock && data.linked ? (
        <AttendanceClockPanel
          employeeName={data.employeeName}
          workDate={data.clock.workDate}
          presence={data.clock.presence}
          canClockIn={data.clock.canClockIn}
          canClockOut={data.clock.canClockOut}
          canBreakStart={data.clock.canBreakStart}
          canBreakEnd={data.clock.canBreakEnd}
          clockInAction={clockInAction}
          clockOutAction={clockOutAction}
          clockBreakStartAction={clockBreakStartAction}
          clockBreakEndAction={clockBreakEndAction}
          linked={data.linked}
          showTimeHints={false}
          logHoursHref={canLogTime ? '/employee/hours/new' : null}
        />
      ) : (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('home.notLinked')}</p>
      )}

      {taskSummary ? (
        <section className="rounded-xl border border-[var(--pf-border)] bg-[var(--pf-surface)] p-4 space-y-3">
          <h2 className="text-sm font-semibold">{t('home.workSummary.title')}</h2>
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-[var(--pf-text-secondary)]">{t('home.workSummary.dueToday')}</dt>
              <dd className="text-2xl font-bold">{taskSummary.dueToday}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--pf-text-secondary)]">{t('home.workSummary.overdue')}</dt>
              <dd className={cn('text-2xl font-bold', taskSummary.overdue > 0 && 'text-red-600')}>
                {taskSummary.overdue}
              </dd>
            </div>
          </dl>
          <Link href="/employee/tasks" className="text-sm font-medium text-[var(--pf-primary)] hover:underline">
            {t('home.workSummary.viewTasks')}
          </Link>
        </section>
      ) : null}

      {canAttendance ? (
        <Link href="/employee/attendance" className={cn(pressableCardLinkClassName, 'block p-4')}>
          {t('home.myHours')}
        </Link>
      ) : null}
    </div>
  );
}
