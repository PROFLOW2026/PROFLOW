import { getTranslations } from 'next-intl/server';
import { AlertCircle, CheckCircle2, Clock, UserPlus } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Link } from '@/shared/i18n/navigation';
import type { TodayAttendanceOverview } from '../application/attendance-owner-views';

interface AttendanceDailyRosterProps {
  readonly overview: TodayAttendanceOverview;
}

function formatStartTime(value: Date | null): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatHours(hours: number | null): string {
  if (hours == null) return '—';
  return hours % 1 === 0 ? String(hours) : hours.toFixed(2).replace(/\.?0+$/, '');
}

export async function AttendanceDailyRoster({ overview }: AttendanceDailyRosterProps) {
  const t = await getTranslations('workforce.attendance');

  return (
    <section
      className="rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 shadow-sm"
      aria-label={t('dailyRoster.title')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--pf-text-primary)]">
            {t('dailyRoster.title')} ·{' '}
            <span className="font-normal text-[var(--pf-text-muted)]" dir="ltr">
              {overview.workDate}
            </span>
          </h2>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('todayView.hint')}</p>
        </div>
        <Link
          href="/workforce/attendance/monthly"
          className="text-sm font-medium underline-offset-2 hover:underline"
        >
          {t('monthlyGrid.navLink')}
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-500" />
          <span>
            <span className="font-semibold">{overview.reportedCount}</span> {t('dailyRoster.reported')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <AlertCircle
            className={`h-5 w-5 flex-shrink-0 ${overview.missingCount > 0 ? 'text-red-500' : 'text-green-500'}`}
          />
          <span>
            <span className="font-semibold">{overview.missingCount}</span> {t('dailyRoster.notReported')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 flex-shrink-0 text-amber-500" />
          <span>
            <span className="font-semibold">{overview.awaitingCount}</span> {t('todayView.awaiting')}
          </span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--pf-border-default)] text-start text-[var(--pf-text-muted)]">
              <th className="py-2 pe-3 font-medium">{t('todayView.columns.employee')}</th>
              <th className="py-2 pe-3 font-medium">{t('todayView.columns.project')}</th>
              <th className="py-2 pe-3 font-medium">{t('todayView.columns.start')}</th>
              <th className="py-2 pe-3 font-medium">{t('todayView.columns.hours')}</th>
              <th className="py-2 pe-3 font-medium">{t('todayView.columns.approval')}</th>
              <th className="py-2 font-medium">{t('todayView.columns.action')}</th>
            </tr>
          </thead>
          <tbody>
            {overview.rows.map((row) => (
              <tr
                key={row.employeeId}
                className={
                  row.reported
                    ? 'border-b border-[var(--pf-border-default)]'
                    : 'border-b border-[var(--pf-border-default)] bg-red-50/70 dark:bg-red-950/20'
                }
              >
                <td className="py-2 pe-3 font-medium">{row.employeeName}</td>
                <td className="py-2 pe-3 text-[var(--pf-text-secondary)]">
                  {row.projectNames.length > 0
                    ? row.projectNames.join(', ')
                    : row.reported
                      ? t('todayView.noProject')
                      : '—'}
                </td>
                <td className="py-2 pe-3" dir="ltr">
                  {formatStartTime(row.startTime)}
                </td>
                <td className="py-2 pe-3" dir="ltr">
                  {formatHours(row.hours)}
                </td>
                <td className="py-2 pe-3">
                  <StatusBadge
                    shape={
                      row.approvalStatus === 'approved'
                        ? 'approved'
                        : row.approvalStatus === 'submitted'
                          ? 'pending'
                          : row.approvalStatus === 'missing'
                            ? 'cancelled'
                            : row.approvalStatus === 'awaiting'
                              ? 'onHold'
                              : 'draft'
                    }
                    label={t(`todayView.approval.${row.approvalStatus}`)}
                  />
                </td>
                <td className="py-2">
                  {row.dayId ? (
                    <Link
                      href={`/workforce/attendance?dayId=${row.dayId}&employeeId=${row.employeeId}`}
                      className="text-sm font-medium underline-offset-2 hover:underline"
                    >
                      {t('todayView.openDay')}
                    </Link>
                  ) : (
                    <Link
                      href={`/workforce/attendance?employeeId=${row.employeeId}&update=1&workDate=${overview.workDate}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-red-700 underline-offset-2 hover:underline dark:text-red-300"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {t('dailyRoster.addAttendance')}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
