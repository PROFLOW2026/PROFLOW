import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeAccessibleForms } from '@/modules/employee-app/application/employee-operational';
import {
  employeeListPanelClass,
  employeeListRowClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeFormsPage() {
  const t = await getTranslations('employeeApp.forms');
  const forms = await withOrgContext(async (context) => listEmployeeAccessibleForms(context));

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('intro')}</p>
      <ul className={employeeListPanelClass}>
        {forms.map((form) => (
          <li key={form.id} className={employeeListRowClass}>
            <p className="text-sm font-medium">{form.name}</p>
            {form.description ? (
              <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">{form.description}</p>
            ) : null}
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
