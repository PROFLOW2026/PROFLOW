/**
 * Attendance Allocation Coverage panel (Task 3).
 *
 * Server component — shows per-employee attendance hours vs approved project
 * allocation hours for a calendar month, highlighting unallocated gaps.
 *
 * Business context:
 * - Attendance hours = physical presence from clock-in/clock-out events.
 * - Allocated hours = approved project time-entry hours.
 * - Unallocated = max(0, attendance − allocated).
 * - Unallocated > 0 → employee was present but not all hours are tied to a
 *   project allocation. These are candidates for follow-up or overhead coding.
 */

import { getTranslations, getLocale } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { getAttendanceAllocationCoverage } from '../application/attendance-owner-views';

interface Props {
  readonly yearMonth: string;
}

function formatHours(h: number): string {
  if (h % 1 === 0) return String(h);
  return h.toFixed(1);
}

export async function AttendanceAllocationCoveragePanel({ yearMonth }: Props) {
  const t = await getTranslations('workforce.allocationCoverage');

  const coverage = await withOrgContext(async (context) => {
    return getAttendanceAllocationCoverage(context, yearMonth).catch(() => null);
  });

  if (!coverage) return null;
  if (coverage.rows.length === 0) {
    return (
      <p className="rounded-lg border border-[var(--pf-border)] px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
        {t('noAttendance')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Summary banner */}
      {coverage.employeesWithUnallocatedCount > 0 ? (
        <div className="rounded-lg border border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] px-4 py-3 text-sm">
          <p className="font-medium text-[var(--pf-status-warning-fg)]">
            {t('unallocatedSummary', {
              employees: coverage.employeesWithUnallocatedCount,
              hours: formatHours(coverage.totalUnallocatedHours),
            })}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--pf-status-success-border)] bg-[var(--pf-status-success-bg)] px-4 py-3 text-sm text-[var(--pf-status-success-fg)]">
          {t('fullyAllocated')}
        </div>
      )}

      {/* Per-employee table */}
      <div className="overflow-x-auto rounded-lg border border-[var(--pf-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--pf-bg-subtle)] text-xs text-[var(--pf-text-secondary)]">
            <tr>
              <th className="px-3 py-2 text-start font-medium">{t('employee')}</th>
              <th className="px-3 py-2 text-end font-medium">{t('attendanceHours')}</th>
              <th className="px-3 py-2 text-end font-medium">{t('allocatedHours')}</th>
              <th className="px-3 py-2 text-end font-medium">{t('unallocatedHours')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--pf-border)]">
            {coverage.rows.map((row) => (
              <tr
                key={row.employeeId}
                className={
                  row.unallocatedHours > 0
                    ? 'bg-[var(--pf-status-warning-subtle)]'
                    : undefined
                }
              >
                <td className="px-3 py-2 font-medium">{row.employeeName}</td>
                <td className="px-3 py-2 text-end tabular-nums">
                  {formatHours(row.attendanceHours)}
                </td>
                <td className="px-3 py-2 text-end tabular-nums">
                  {formatHours(row.allocatedHours)}
                </td>
                <td
                  className={`px-3 py-2 text-end tabular-nums font-medium ${
                    row.unallocatedHours > 0
                      ? 'text-[var(--pf-status-warning-fg)]'
                      : 'text-[var(--pf-text-secondary)]'
                  }`}
                >
                  {formatHours(row.unallocatedHours)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-[var(--pf-bg-subtle)] text-xs font-semibold">
            <tr>
              <td className="px-3 py-2">{t('total')}</td>
              <td className="px-3 py-2 text-end tabular-nums">
                {formatHours(
                  coverage.rows.reduce((s, r) => s + r.attendanceHours, 0),
                )}
              </td>
              <td className="px-3 py-2 text-end tabular-nums">
                {formatHours(
                  coverage.rows.reduce((s, r) => s + r.allocatedHours, 0),
                )}
              </td>
              <td
                className={`px-3 py-2 text-end tabular-nums ${
                  coverage.totalUnallocatedHours > 0
                    ? 'text-[var(--pf-status-warning-fg)]'
                    : 'text-[var(--pf-text-secondary)]'
                }`}
              >
                {formatHours(coverage.totalUnallocatedHours)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
