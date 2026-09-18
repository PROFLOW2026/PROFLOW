import { getTranslations } from 'next-intl/server';
import { authorize } from '@/shared/permissions/authorize';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeAssignedProjects } from '@/modules/employee-app';

export default async function EmployeeProjectsPage() {
  const t = await getTranslations('employeeApp.lists');
  const projectRows = await withOrgContext(async (context) => {
    await authorize(context, { permission: PERMISSIONS.PROJECTS_READ, scope: 'assigned_only' });
    return listEmployeeAssignedProjects(context);
  });

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-[var(--pf-border)] rounded-lg border border-[var(--pf-border)]">
        {projectRows.map((project) => (
          <li key={project.id} className="px-4 py-3 text-sm font-medium">
            {project.name}
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
