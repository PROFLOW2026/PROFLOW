import { getTranslations } from 'next-intl/server';
import { authorize } from '@/shared/permissions/authorize';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeAssignedProjects } from '@/modules/employee-app';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { Link } from '@/shared/i18n/navigation';
import { EmployeeProjectSearch } from '@/modules/employee-app/ui/employee-project-search';
import { Button } from '@/components/ui/button';
import {
  employeeListPanelClass,
  employeeListRowLinkClass,
  employeePageStackClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeProjectsPage() {
  const t = await getTranslations('employeeApp.lists');
  const tProjects = await getTranslations('employeeApp.projects');
  const payload = await withOrgContext(async (context) => {
    const canCreate = employeeHasPermission(context, PERMISSIONS.PROJECTS_CREATE);
    const canRead = employeeHasPermission(context, PERMISSIONS.PROJECTS_READ);
    if (canRead) {
      await authorize(context, { permission: PERMISSIONS.PROJECTS_READ });
    } else if (!canCreate) {
      await authorize(context, { permission: PERMISSIONS.PROJECTS_READ });
    }
    return {
      projectRows: canRead ? await listEmployeeAssignedProjects(context) : [],
      canCreate,
    };
  });

  return (
    <div className={employeePageStackClass}>
      {payload.canCreate ? (
        <Button asChild size="lg" block>
          <Link href="/employee/projects/new">{tProjects('createButton')}</Link>
        </Button>
      ) : null}
      {payload.projectRows.length > 0 ? (
        <EmployeeProjectSearch projects={payload.projectRows} />
      ) : null}
      <ul className={employeeListPanelClass}>
        {payload.projectRows.map((project) => (
          <li key={project.id} data-project-row data-search={project.displayName.toLowerCase()}>
            <Link href={`/employee/projects/${project.id}`} className={employeeListRowLinkClass}>
              <span className="text-sm font-medium">{project.displayName}</span>
            </Link>
          </li>
        ))}
        {payload.projectRows.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
            {t('projectsEmpty')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
