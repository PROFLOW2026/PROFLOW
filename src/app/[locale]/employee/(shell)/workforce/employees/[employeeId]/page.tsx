import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  getEmployee,
  listAssignableProjects,
  loadMonthlyEmployerCostReview,
} from '@/modules/workforce';
import {
  canManageWorkforceCost,
  canReadWorkforceCost,
} from '@/modules/workforce/application/workforce-cost-authz';
import { MonthlyEmployerCostReview } from '@/modules/workforce/ui/monthly-employer-cost-review';
import { employeeMonthlyEmployerCostReviewActions } from '@/app/[locale]/employee/(shell)/workforce/employee-monthly-cost-review-actions';
import { todayInTimeZone } from '@/shared/dates';
import { employeePageStackClass, employeePanelClass } from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeWorkforceEmployeePage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  const t = await getTranslations('employeeApp.workforceHub');

  const data = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (
      !employeeHasPermission(context, PERMISSIONS.WORKFORCE_COST_READ) &&
      !employeeHasPermission(context, PERMISSIONS.WORKFORCE_COST_MANAGE)
    ) {
      return null;
    }

    try {
      const employee = await getEmployee(context, employeeId);
      const canReadRates = canReadWorkforceCost(context);
      const canManageCosts = canManageWorkforceCost(context);
      const defaultYearMonth = todayInTimeZone(context.organization.timezone).slice(0, 7);
      const initialReview = canReadRates
        ? await loadMonthlyEmployerCostReview(context, {
            employeeId,
            yearMonth: defaultYearMonth,
          })
        : null;
      const projects = canManageCosts
        ? (await listAssignableProjects(context).catch(() => [])).map((project) => ({
            id: project.id,
            name: project.name,
          }))
        : [];

      return {
        employee,
        canReadRates,
        canManageCosts,
        defaultYearMonth,
        initialReview,
        projects,
        currency: context.organization.baseCurrency,
      };
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  return (
    <div className={employeePageStackClass}>
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">{data.employee.name}</h1>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('employerCostSection')}</p>
      </header>

      {data.canReadRates ? (
        <section className={employeePanelClass}>
          <MonthlyEmployerCostReview
            employeeId={data.employee.id}
            employeeName={data.employee.name}
            currency={data.currency}
            defaultYearMonth={data.defaultYearMonth}
            projects={data.projects}
            canReview={data.canReadRates}
            canManage={data.canManageCosts}
            initialReview={data.initialReview}
            reviewActions={employeeMonthlyEmployerCostReviewActions}
          />
        </section>
      ) : (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('costReadRequired')}</p>
      )}
    </div>
  );
}
