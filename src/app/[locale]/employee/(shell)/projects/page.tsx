import { ChevronRight, FolderKanban, Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { authorize } from '@/shared/permissions/authorize';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeAssignedProjects } from '@/modules/employee-app';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { resolveAccessibleProjectIdsForUser } from '@/modules/employee-app/application/project-scope';
import { Link } from '@/shared/i18n/navigation';
import { EmployeeProjectSearch } from '@/modules/employee-app/ui/employee-project-search';
import { EmployeeEmptyState } from '@/modules/employee-app/ui/employee-empty-state';
import { listMyProjectMembershipsOrEmpty } from '@/modules/project-team';
import { MyProjectMembershipsList } from '@/modules/project-team/ui/my-project-access';
import { rtlFlipClassName } from '@/shared/i18n/ltr-island';
import {
  employeeIconTileClass,
  employeeListPanelClass,
  employeeListRowLinkClass,
  employeeMetaChipClass,
  employeePageStackClass,
  employeePrimaryButtonClass,
} from '@/modules/employee-app/ui/employee-surface-styles';
import { cn } from '@/shared/ui/cn';

export default async function EmployeeProjectsPage() {
  const t = await getTranslations('employeeApp.lists');
  const tProjects = await getTranslations('employeeApp.projects');
  const memberships = await withOrgContext(listMyProjectMembershipsOrEmpty);
  const payload = await withOrgContext(async (context) => {
    const canCreate = employeeHasPermission(context, PERMISSIONS.PROJECTS_CREATE);
    const canRead = employeeHasPermission(context, PERMISSIONS.PROJECTS_READ);
    const allowedProjectIds = await resolveAccessibleProjectIdsForUser(context);
    const hasAssignedProjectSurface =
      allowedProjectIds === null || allowedProjectIds.length > 0;

    if (canRead) {
      await authorize(context, { permission: PERMISSIONS.PROJECTS_READ });
    } else if (!canCreate && !hasAssignedProjectSurface && memberships.length === 0) {
      await authorize(context, { permission: PERMISSIONS.PROJECTS_READ });
    }

    return {
      projectRows: hasAssignedProjectSurface ? await listEmployeeAssignedProjects(context) : [],
      memberships,
      canCreate,
    };
  });

  return (
    <div className={employeePageStackClass}>
      {payload.canCreate ? (
        <div className="flex justify-end">
          <Link href="/employee/projects/new" className={employeePrimaryButtonClass}>
            <Plus className="size-4" aria-hidden />
            {tProjects('createButton')}
          </Link>
        </div>
      ) : null}

      <MyProjectMembershipsList
        memberships={payload.memberships}
        hrefFor={(projectId) => `/employee/projects/${projectId}/team`}
      />

      {payload.projectRows.length > 0 ? (
        <EmployeeProjectSearch projects={payload.projectRows} />
      ) : null}

      {payload.projectRows.length > 0 ? (
        <ul className={cn(employeeListPanelClass, 'md:shadow-[var(--pf-shadow-sm)]')}>
          {payload.projectRows.map((project) => (
            <li
              key={project.id}
              data-project-row
              data-search={`${project.displayName} ${project.name} ${project.documentNumber ?? ''}`.toLowerCase()}
            >
              <Link
                href={`/employee/projects/${project.id}`}
                className={cn(
                  employeeListRowLinkClass,
                  'md:flex md:items-center md:justify-between md:gap-4',
                )}
              >
                <div className="flex min-w-0 items-start gap-3 md:items-center">
                  <span className={cn(employeeIconTileClass, 'mt-0.5 md:mt-0')} aria-hidden>
                    <FolderKanban className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-base font-semibold leading-snug text-[var(--pf-text-primary)]">
                      {project.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {project.documentNumber ? (
                        <span className={employeeMetaChipClass}>{project.documentNumber}</span>
                      ) : null}
                      {project.displayName !== project.name ? (
                        <span className="truncate text-xs text-[var(--pf-text-secondary)]">
                          {project.displayName}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--pf-accent)] md:mt-0 md:shrink-0">
                  {t('openProject')}
                  <ChevronRight className={rtlFlipClassName('size-3.5')} aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : payload.memberships.length === 0 ? (
        <EmployeeEmptyState
          title={t('projectsEmpty')}
          description={t('projectsEmptyHint')}
          icon={FolderKanban}
        />
      ) : null}
    </div>
  );
}
