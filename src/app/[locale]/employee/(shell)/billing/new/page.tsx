import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { listBillingProjectOptions } from '@/modules/billing';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates';
import { employeeCreateBillingRecordAction } from '../actions';

export default async function EmployeeCreateBillingPage() {
  const t = await getTranslations('employeeApp.billing.createForm');

  const payload = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!employeeHasPermission(context, PERMISSIONS.BILLING_MANAGE)) return null;
    const projects = await listBillingProjectOptions(context);
    return {
      projects,
      defaultDate: todayInTimeZone(context.organization.timezone),
      currency: context.organization.baseCurrency ?? 'ILS',
    };
  });

  if (!payload) notFound();

  return (
    <div className="space-y-4">
      <Link
        href="/employee/billing"
        className="inline-flex text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text)]"
      >
        {t('back')}
      </Link>

      <form action={employeeCreateBillingRecordAction} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="projectId" className="text-sm font-medium">
            {t('project')}
          </label>
          <select
            id="projectId"
            name="projectId"
            required
            className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
          >
            <option value="">{t('selectProject')}</option>
            {payload.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
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
          <label htmlFor="issueDate" className="text-sm font-medium">
            {t('issueDate')}
          </label>
          <input
            id="issueDate"
            name="issueDate"
            type="date"
            defaultValue={payload.defaultDate}
            required
            className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="dueDate" className="text-sm font-medium">
            {t('dueDate')}
          </label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="reference" className="text-sm font-medium">
            {t('reference')}
          </label>
          <input
            id="reference"
            name="reference"
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
