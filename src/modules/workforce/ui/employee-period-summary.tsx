/**
 * Employee Period Summary panel (LAB-HIGH-001).
 *
 * Displays attendance + time totals for a date range, broken down by project.
 * Rendered server-side; wraps the getEmployeePeriodSummary use-case.
 */

import { getTranslations, getLocale } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Card } from '@/components/ui/card';
import { withOrgContext } from '@/shared/auth/session';
import { type BusinessDate } from '@/shared/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { isZeroMoney } from '@/shared/money';
import { getLaborCostDefaultsForApply } from '@/modules/tenancy';
import { resolveOrgWorkWeekdays } from '@/modules/tenancy/domain/labor-cost-defaults';
import { getEmployeePeriodSummary } from '../application/employee-period-summary';

export interface EmployeePeriodSummaryPanelProps {
  readonly employeeId: string;
  readonly fromDate: BusinessDate;
  readonly toDate: BusinessDate;
}

export async function EmployeePeriodSummaryPanel({
  employeeId,
  fromDate,
  toDate,
}: EmployeePeriodSummaryPanelProps) {
  const [t, locale] = await Promise.all([getTranslations('workforce'), getLocale()]);

  const summary = await withOrgContext(async (context) => {
    const laborDefaults = await getLaborCostDefaultsForApply(context).catch(() => null);
    const workWeekdays = resolveOrgWorkWeekdays(laborDefaults);

    return getEmployeePeriodSummary(context, {
      employeeId,
      fromDate,
      toDate,
      workWeekdays,
    }).catch(() => null);
  });

  if (!summary) return null;

  const fromFormatted = formatBusinessDate(fromDate, locale, 'medium');
  const toFormatted = formatBusinessDate(toDate, locale, 'medium');

  const totalHoursFormatted =
    summary.totalHours % 1 === 0
      ? String(summary.totalHours)
      : summary.totalHours.toFixed(2).replace(/\.?0+$/, '');

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h2 className="text-base font-semibold">{t('employees.periodSummary.title')}</h2>
        <p className="mt-0.5 text-sm text-[var(--pf-text-secondary)]">
          <span dir="ltr">{fromFormatted}</span>
          {' — '}
          <span dir="ltr">{toFormatted}</span>
        </p>
      </div>

      {/* Totals row */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('employees.periodSummary.workDays')}</p>
          <p className="font-semibold">{summary.totalDays}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('employees.periodSummary.hours')}</p>
          <p className="font-semibold">{totalHoursFormatted}</p>
        </div>
        {summary.missingDays.length > 0 ? (
          <div>
            <p className="text-xs text-[var(--pf-status-warning-fg)]">
              {t('employees.periodSummary.missing', { count: summary.missingDays.length })}
            </p>
            <p className="text-[var(--pf-status-warning-fg)]" dir="ltr">
              {summary.missingDays.slice(0, 5).join(', ')}
              {summary.missingDays.length > 5
                ? ` +${summary.missingDays.length - 5}`
                : ''}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-xs text-[var(--pf-text-muted)]">{t('employees.periodSummary.missingNone')}</p>
            <p className="font-semibold">0</p>
          </div>
        )}
        <div>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('employees.periodSummary.pending')}</p>
          <p className="font-semibold">{summary.pendingApprovalCount}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('employees.periodSummary.approved')}</p>
          <p className="font-semibold">{summary.approvedCount}</p>
        </div>
      </div>

      {/* Project breakdown */}
      {summary.projectBreakdown.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t('employees.periodSummary.projectBreakdown')}</h3>
          <ul className="flex flex-col gap-1.5">
            {summary.projectBreakdown.map((row) => (
              <li
                key={row.projectId}
                className="flex min-w-0 items-start justify-between gap-3 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.projectName}</p>
                  <p className="text-xs text-[var(--pf-text-muted)]">
                    {t('employees.periodSummary.projectMeta', {
                      days: row.days,
                      hours:
                        row.hours % 1 === 0
                          ? String(row.hours)
                          : row.hours.toFixed(2).replace(/\.?0+$/, ''),
                    })}
                  </p>
                </div>
                {row.allocatedCost ? (
                  <MoneyText value={row.allocatedCost} className="shrink-0 text-sm" />
                ) : (
                  <span className="shrink-0 text-xs text-[var(--pf-status-warning-fg)]">
                    {t('employees.periodSummary.costPending')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Unallocated row */}
      {(summary.unallocatedDays > 0 || summary.unallocatedHours > 0) ? (
        <div className="flex min-w-0 items-start justify-between gap-3 rounded-md bg-[var(--pf-bg-subtle)] px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{t('employees.periodSummary.unallocated')}</p>
            <p className="text-xs text-[var(--pf-text-muted)]">
              {t('employees.periodSummary.unallocatedMeta', {
                days: summary.unallocatedDays,
                hours:
                  summary.unallocatedHours % 1 === 0
                    ? String(summary.unallocatedHours)
                    : summary.unallocatedHours.toFixed(2).replace(/\.?0+$/, ''),
              })}
            </p>
          </div>
          {summary.unallocatedCost && !isZeroMoney(summary.unallocatedCost) ? (
            <MoneyText value={summary.unallocatedCost} className="shrink-0 text-sm" />
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
