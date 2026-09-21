import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeePmCreatableProjects } from '@/modules/employee-app/application/employee-pm-tasks';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import {
  employeeFilterInputClass,
  employeePageStackClass,
  employeePanelClass,
  employeePrimaryButtonClass,
  employeeSectionTitleClass,
} from '@/modules/employee-app/ui/employee-surface-styles';
import { cn } from '@/shared/ui/cn';
import { employeeCreateTaskAction } from '../actions';

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
      <form action={employeeCreateTaskAction} className={cn(employeePanelClass, 'space-y-4')}>
        {lockedProject ? (
          <div className="space-y-2">
            <span className="text-sm font-medium text-[var(--pf-text-primary)]">{t('project')}</span>
            <input type="hidden" name="projectId" value={lockedProject} />
            <p className="text-sm text-[var(--pf-text-secondary)]">{lockedProjectLabel}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="projectId" className="text-sm font-medium text-[var(--pf-text-primary)]">
              {t('project')}
            </label>
            <select
              id="projectId"
              name="projectId"
              required
              defaultValue={projects[0]?.id}
              className={employeeFilterInputClass}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.displayName}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-2">
          <label htmlFor="title" className="text-sm font-medium text-[var(--pf-text-primary)]">
            {t('title')}
          </label>
          <input id="title" name="title" required className={employeeFilterInputClass} />
        </div>
        <div className="space-y-2">
          <label htmlFor="description" className="text-sm font-medium text-[var(--pf-text-primary)]">
            {t('description')}
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            className={cn(employeeFilterInputClass, 'min-h-[88px]')}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="priority" className="text-sm font-medium text-[var(--pf-text-primary)]">
            {t('priority')}
          </label>
          <select id="priority" name="priority" defaultValue="medium" className={employeeFilterInputClass}>
            <option value="none">{t('priorityNone')}</option>
            <option value="low">{t('priorityLow')}</option>
            <option value="medium">{t('priorityMedium')}</option>
            <option value="high">{t('priorityHigh')}</option>
            <option value="urgent">{t('priorityUrgent')}</option>
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="dueDate" className="text-sm font-medium text-[var(--pf-text-primary)]">
            {t('dueDate')}
          </label>
          <input id="dueDate" name="dueDate" type="date" className={employeeFilterInputClass} />
        </div>
        <button type="submit" className={cn(employeePrimaryButtonClass, 'w-full')}>
          {t('submit')}
        </button>
      </form>
    </div>
  );
}
