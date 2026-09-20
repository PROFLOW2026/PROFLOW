import { getTranslations } from 'next-intl/server';
import { authorize } from '@/shared/permissions/authorize';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeAssignedProjects } from '@/modules/employee-app';
import { Link } from '@/shared/i18n/navigation';
import { EmployeeProjectSearch } from '@/modules/employee-app/ui/employee-project-search';
import {
  employeeListPanelClass,
  employeeListRowLinkClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeProjectsPage() {
  const t = await getTranslations('employeeApp.lists');
  const projectRows = await withOrgContext(async (context) => {
    await authorize(context, { permission: PERMISSIONS.PROJECTS_READ });
    return listEmployeeAssignedProjects(context);
  });

  return (
    <div className="space-y-4">
      {projectRows.length > 0 ? <EmployeeProjectSearch projects={projectRows} /> : null}
      <ul className={employeeListPanelClass}>
        {projectRows.map((project) => (
          <li key={project.id} data-project-row data-search={project.displayName.toLowerCase()}>
            <Link href={`/employee/projects/${project.id}`} className={employeeListRowLinkClass}>
              <span className="text-sm font-medium">{project.displayName}</span>
            </Link>
          </li>
        ))}
        {projectRows.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
            {t('projectsEmpty')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
