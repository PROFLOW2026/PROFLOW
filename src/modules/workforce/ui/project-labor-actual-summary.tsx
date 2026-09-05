import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { formatWorkHoursValue } from '@/modules/workforce/domain/format-work-hours';
import { getProjectLaborByEmployeeAggregate } from '@/modules/financials/application/get-project-actual-breakdown';
import { sumTimeLaborPeriodReconciliation } from '@/modules/workforce';
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

  const [aggregate, reconciliation, showCosts] = await Promise.all([
    getProjectLaborByEmployeeAggregate(projectId),
    withOrgContext(async (context) =>
      sumTimeLaborPeriodReconciliation(
        context.db,
        context.organizationId,
        null,
        null,
        projectId,
      ),
    ),
    withOrgContext(async (context) => Promise.resolve(canViewWorkforceCosts(context))),
  ]);

  const hasAllocated =
    Boolean(aggregate?.hasWorkforceData) && (aggregate?.employees.length ?? 0) > 0;
  const hasPending = reconciliation.pendingHours > 0;
  if (!hasAllocated && !hasPending) {
    return null;
  }

  const formattedHours = formatWorkHoursValue(
    aggregate?.employees.reduce((sum, row) => sum + Number(row.hours), 0) ?? 0,
  );
  const allocatedHours = formatWorkHoursValue(reconciliation.allocatedHours);
  const unallocatedHours = formatWorkHoursValue(reconciliation.pendingHours);
  const totalHours = formatWorkHoursValue(
    reconciliation.allocatedHours + reconciliation.pendingHours,
  );

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3"
      data-pf-project-labor-actual={surface}
    >
      <div className="flex flex-col gap-1 text-start">
        <h3 className="text-sm font-semibold">{t('laborActualTitle')}</h3>
        <p className="text-xs text-[var(--pf-text-muted)]">{t('laborActualHint')}</p>
        <p className="text-xs text-[var(--pf-text-secondary)]">
          {t('laborPoolEquation', {
            allocated: allocatedHours,
            unallocated: unallocatedHours,
            total: totalHours,
          })}
        </p>
        {hasAllocated ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {t('laborActualSummary', {
            hours: formattedHours,
            count: aggregate!.employees.length,
          })}
          {showCosts ? (
            <>
              {' · '}
              {(aggregate?.entriesMissingCost ?? 0) > 0 ? (
                <span className="text-[var(--pf-status-warning-fg)]">
                  {t('laborActualMissingCost', { count: aggregate?.entriesMissingCost ?? 0 })}
                </span>
              ) : aggregate?.totalLaborCost ? (
                <MoneyText value={aggregate.totalLaborCost} />
              ) : null}
            </>
          ) : null}
        </p>
        ) : null}
      </div>

      {hasAllocated ? (
      <ul className="flex flex-col gap-2">
        {aggregate!.employees.map((row) => (
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
      ) : null}
    </section>
  );
}
