import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeePmCreatableProjects } from '@/modules/employee-app/application/employee-pm-tasks';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import {
  employeePageStackClass,
  employeePanelClass,
  employeeSectionTitleClass,
} from '@/modules/employee-app/ui/employee-surface-styles';
import { EmployeeTaskCreateFields } from '@/modules/employee-app/ui/employee-task-create-fields';
import { cn } from '@/shared/ui/cn';
import { employeeCreateTaskAction } from '../actions';
import { loadEmployeeTaskAssigneeOptionsAction } from '../load-assignee-options';

interface PageProps {
  searchParams: Promise<{ projectId?: string }>;
}

export default async function EmployeeCreateTaskPage({ searchParams }: PageProps) {
  const { projectId } = await searchParams;
  const t = await getTranslations('employeeApp.tasks.create');

  const projects = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    return listEmployeePmCreatableProjects(context);
  });

  if (projects.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-[var(--pf-text-secondary)]">{t('noProjects')}</p>
    );
  }

  const lockedProject =
    projectId && projects.some((project) => project.id === projectId) ? projectId : null;
  const lockedProjectLabel = lockedProject
    ? projects.find((project) => project.id === lockedProject)?.displayName
    : null;

  return (
    <div className={employeePageStackClass}>
      <h1 className={employeeSectionTitleClass}>{t('formTitle')}</h1>
      <div className={cn(employeePanelClass)}>
        <EmployeeTaskCreateFields
          projects={projects}
          lockedProjectId={lockedProject}
          lockedProjectLabel={lockedProjectLabel}
          loadAssigneeOptions={loadEmployeeTaskAssigneeOptionsAction}
          formAction={employeeCreateTaskAction}
        />
      </div>
    </div>
  );
}
