import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import {
  listEmployeeCreatableExpenseProjects,
} from '@/modules/employee-app/application/employee-operational';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission, employeePermissionScope } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates';
import { employeeCreateExpenseAction } from '../actions';
import { notFound } from 'next/navigation';

export default async function EmployeeCreateExpensePage() {
  const t = await getTranslations('employeeApp.expenses.createForm');

  const payload = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!employeeHasPermission(context, PERMISSIONS.EXPENSES_CREATE)) return null;

    const scope = employeePermissionScope(context, PERMISSIONS.EXPENSES_CREATE) ?? 'assigned_only';
    const projects = await listEmployeeCreatableExpenseProjects(context);
    const defaultDate = todayInTimeZone(context.organization.timezone);

    return {
      scope,
      projects,
      defaultDate,
      currency: context.organization.baseCurrency ?? 'ILS',
    };
  });

  if (!payload) notFound();

  const showProjectField = payload.scope !== 'assigned_only' || payload.projects.length > 0;

  return (
    <div className="space-y-4">
      <Link
        href="/employee/expenses"
        className="inline-flex text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text)]"
      >
        {t('back')}
      </Link>

      {payload.scope === 'assigned_only' && payload.projects.length === 0 ? (
        <p className="rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-4 py-3 text-sm text-[var(--pf-text-secondary)]">
          {t('noProjectScope')}
        </p>
      ) : null}

      <form action={employeeCreateExpenseAction} className="space-y-4">
        {showProjectField ? (
          <div className="space-y-2">
            <label htmlFor="projectId" className="text-sm font-medium">
              {t('project')}
            </label>
            <select
              id="projectId"
              name="projectId"
              className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
            >
              <option value="">{t('noProject')}</option>
              {payload.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.displayName}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="space-y-2">
          <label htmlFor="description" className="text-sm font-medium">
            {t('description')}
          </label>
          <input
            id="description"
            name="description"
            required
            className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="amount" className="text-sm font-medium">
            {t('amount', { currency: payload.currency })}
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="expenseDate" className="text-sm font-medium">
            {t('date')}
          </label>
          <input
            id="expenseDate"
            name="expenseDate"
            type="date"
            defaultValue={payload.defaultDate}
            required
            className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="supplierName" className="text-sm font-medium">
            {t('vendor')}
          </label>
          <input
            id="supplierName"
            name="supplierName"
            className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="min-h-[48px] w-full rounded-xl bg-[var(--pf-primary)] px-4 py-3 text-sm font-medium text-white"
        >
          {t('submit')}
        </button>
      </form>
    </div>
  );
}
