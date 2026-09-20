import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeePmCreatableProjects } from '@/modules/employee-app/application/employee-pm-tasks';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
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
      <p className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">{t('noProjects')}</p>
    );
  }

  return (
    <form action={employeeCreateTaskAction} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="projectId" className="text-sm font-medium">
          {t('project')}
        </label>
        <select
          id="projectId"
          name="projectId"
          required
          defaultValue={projectId ?? projects[0]?.id}
          className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.displayName}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="title" className="text-sm font-medium">
          {t('title')}
        </label>
        <input
          id="title"
          name="title"
          required
          className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium">
          {t('description')}
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="priority" className="text-sm font-medium">
          {t('priority')}
        </label>
        <select
          id="priority"
          name="priority"
          defaultValue="medium"
          className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
        >
          <option value="none">{t('priorityNone')}</option>
          <option value="low">{t('priorityLow')}</option>
          <option value="medium">{t('priorityMedium')}</option>
          <option value="high">{t('priorityHigh')}</option>
          <option value="urgent">{t('priorityUrgent')}</option>
        </select>
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
      <button
        type="submit"
        className="min-h-[48px] w-full rounded-xl bg-[var(--pf-primary)] px-4 py-3 text-sm font-medium text-white"
      >
        {t('submit')}
      </button>
    </form>
  );
}
