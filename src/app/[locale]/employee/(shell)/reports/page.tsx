import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { authorize } from '@/shared/permissions/authorize';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  employeeListPanelClass,
  employeeListRowLinkClass,
  employeePageStackClass,
  employeeSectionTitleClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeReportsPage() {
  const t = await getTranslations('employeeApp.reports');

  const links = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    await authorize(context, { permission: PERMISSIONS.PROJECT_FINANCIALS_READ });
    const items: Array<{ href: string; label: string }> = [];
    if (employeeHasPermission(context, PERMISSIONS.BILLING_READ)) {
      items.push({ href: '/employee/billing', label: t('billingLink') });
    }
    if (employeeHasPermission(context, PERMISSIONS.PROJECTS_READ)) {
      items.push({ href: '/employee/projects', label: t('projectsLink') });
    }
    if (
      employeeHasPermission(context, PERMISSIONS.WORKFORCE_COST_READ) ||
      employeeHasPermission(context, PERMISSIONS.WORKFORCE_READ)
    ) {
      items.push({ href: '/employee/workforce', label: t('workforceLink') });
    }
    return items;
  });

  return (
    <div className={employeePageStackClass}>
      <h1 className={employeeSectionTitleClass}>{t('title')}</h1>
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
      <ul className={employeeListPanelClass}>
        {links.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={employeeListRowLinkClass}>
              {item.label}
            </Link>
          </li>
        ))}
        {links.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
            {t('empty')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
