import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeAccessibleForms } from '@/modules/employee-app/application/employee-operational';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import {
  employeeListPanelClass,
  employeeListRowClass,
  employeeSecondaryButtonClass,
} from '@/modules/employee-app/ui/employee-surface-styles';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export default async function EmployeeFormsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; error?: string }>;
}) {
  const t = await getTranslations('employeeApp.forms');
  const query = await searchParams;
  const { forms, canSubmit } = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    return {
      forms: await listEmployeeAccessibleForms(context),
      canSubmit: employeeHasPermission(context, PERMISSIONS.FORMS_SUBMIT),
    };
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('intro')}</p>
      {query.submitted === '1' ? (
        <p className="rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-4 py-3 text-sm">
          {t('submitted')}
        </p>
      ) : null}
      {query.error === '1' ? (
        <p className="rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-4 py-3 text-sm text-[var(--pf-text-secondary)]">
          {t('error')}
        </p>
      ) : null}
      <ul className={employeeListPanelClass}>
        {forms.map((form) => (
          <li key={form.id} className={employeeListRowClass}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{form.name}</p>
                {form.description ? (
                  <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">{form.description}</p>
                ) : null}
              </div>
              {canSubmit ? (
                <Link href={`/employee/forms/${form.id}`} className={employeeSecondaryButtonClass}>
                  {t('submit')}
                </Link>
              ) : null}
            </div>
          </li>
        ))}
        {forms.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
            {t('empty')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
