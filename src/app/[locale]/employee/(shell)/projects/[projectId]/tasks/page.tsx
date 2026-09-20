import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeePermissionScope } from '@/modules/employee-app/application/load-employee-app-context';
import { listEmployeePmTasks, getEmployeeProjectTaskOverview } from '@/modules/employee-app/application/employee-pm-tasks';
import { Link } from '@/shared/i18n/navigation';

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function EmployeeProjectTasksPage({ params }: PageProps) {
  const { projectId } = await params;
  const t = await getTranslations('employeeApp.tasks');
  const locale = await getLocale();

  const data = await withOrgContext(async (context) => {
    const pmScope = employeePermissionScope(context, PERMISSIONS.TASKS_READ);
    if (!pmScope) return null;
    const overview = await getEmployeeProjectTaskOverview(context, projectId);
    if (!overview) return null;
    const tasks = await listEmployeePmTasks(context, { projectId });
    return { overview, tasks };
  });

  if (!data) notFound();

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">{data.overview.name}</p>
      <ul className="divide-y divide-[var(--pf-border)] rounded-lg border border-[var(--pf-border)]">
        {data.tasks.map((task) => (
          <li key={task.id}>
            <Link
              href={`/${locale}/employee/tasks/${task.id}`}
              className="flex items-start gap-3 px-4 py-3 hover:bg-[var(--pf-surface-2)] transition-colors"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="font-medium text-sm leading-snug">{task.title}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--pf-text-muted)]">
                  <span>{t(`status.${task.status}`, { defaultValue: task.status })}</span>
                  {task.priority && task.priority !== 'none' ? (
                    <span>{t(`priority.${task.priority}`, { defaultValue: task.priority })}</span>
                  ) : null}
                  {task.dueDate ? <span>{t('dueDate', { date: task.dueDate })}</span> : null}
                </div>
              </div>
            </Link>
          </li>
        ))}
        {data.tasks.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-[var(--pf-text-secondary)]">
            {t('emptyPmTasks')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
