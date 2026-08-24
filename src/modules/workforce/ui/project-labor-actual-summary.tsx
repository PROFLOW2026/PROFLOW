import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { formatWorkHoursValue } from '@/modules/workforce/domain/format-work-hours';
import { getProjectLaborByEmployeeAggregate } from '@/modules/financials/application/get-project-actual-breakdown';
import { withOrgContext } from '@/shared/auth/session';
import { canViewWorkforceCosts } from './employees-table';

export interface ProjectLaborActualSummaryProps {
  readonly projectId: string;
  /** Where this summary appears — copy only. */
  readonly surface: 'team' | 'time';
}

/**
 * Shared labor Actual by employee — same aggregate as Owner Actual breakdown Employees.
 * Hours always; cost only with WORKFORCE_COST_READ. Missing cost ≠ ₪0.
 */
export async function ProjectLaborActualSummary({
  projectId,
  surface,
}: ProjectLaborActualSummaryProps) {
  const t = await getTranslations('workforce.projectPanel');

  const aggregate = await getProjectLaborByEmployeeAggregate(projectId);
  const showCosts = await withOrgContext(async (context) => canViewWorkforceCosts(context));

  if (!aggregate || !aggregate.hasWorkforceData || aggregate.employees.length === 0) {
    return null;
  }

  const formattedHours = formatWorkHoursValue(
    aggregate.employees.reduce((sum, row) => sum + Number(row.hours), 0),
  );

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3"
      data-pf-project-labor-actual={surface}
    >
      <div className="flex flex-col gap-1 text-start">
        <h3 className="text-sm font-semibold">{t('laborActualTitle')}</h3>
        <p className="text-xs text-[var(--pf-text-muted)]">{t('laborActualHint')}</p>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {t('laborActualSummary', {
            hours: formattedHours,
            count: aggregate.employees.length,
          })}
          {showCosts ? (
            <>
              {' · '}
              {aggregate.entriesMissingCost > 0 ? (
                <span className="text-[var(--pf-status-warning-fg)]">
                  {t('laborActualMissingCost', { count: aggregate.entriesMissingCost })}
                </span>
              ) : (
                <MoneyText value={aggregate.totalLaborCost} />
              )}
            </>
          ) : null}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {aggregate.employees.map((row) => (
          <li
            key={row.employeeId}
            className="flex min-w-0 items-start justify-between gap-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{row.employeeName}</p>
              <p className="text-xs text-[var(--pf-text-muted)]">
                {t('laborActualEmployeeMeta', {
                  hours: formatWorkHoursValue(Number(row.hours)),
                  days: row.workDays,
                })}
              </p>
            </div>
            {showCosts ? (
              <span className="shrink-0 text-end">
                {row.laborCost == null || row.entriesMissingCost > 0 ? (
                  <span className="text-xs text-[var(--pf-status-warning-fg)]">
                    {t('laborActualCostUnavailable')}
                  </span>
                ) : (
                  <MoneyText value={row.laborCost} />
                )}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
