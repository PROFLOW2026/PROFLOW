import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getEmployeeShellData } from '@/modules/employee-app/application/get-employee-shell';
import {
  getEmployeePmTaskWorkSummary,
  listEmployeePmTasks,
} from '@/modules/employee-app/application/employee-pm-tasks';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { loadProjectDisplayNameMap } from '@/modules/projects/application/project-display-names';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { addDays, todayInTimeZone } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import { EmployeeInstallButton } from '@/modules/employee-app/ui/employee-install-button';
import {
  employeeListPanelClass,
  employeeListRowLinkClass,
  employeePageStackClass,
  employeePanelClass,
} from '@/modules/employee-app/ui/employee-surface-styles';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'employeeApp' });
  return { title: t('title') };
}

const CLOSED_STATUSES = new Set(['done', 'cancelled']);

type HomeTaskKind = 'overdue' | 'dueToday' | 'upcoming' | 'blocked';

export default async function EmployeeHomePage() {
  const t = await getTranslations('employeeApp');
  const { data, taskSummary, priorityTasks } = await withOrgContext(async (context) => {
    const shell = await getEmployeeShellData(context);
    const hasTasks = employeeHasPermission(context, PERMISSIONS.TASKS_READ);

    let summary = null;
    let tasks: Array<{
      id: string;
      title: string;
      dueDate: string | null;
      status: string;
      projectLabel: string | null;
      kind: HomeTaskKind;
    }> = [];

    if (hasTasks) {
      summary = await getEmployeePmTaskWorkSummary(context);
      const today = todayInTimeZone(context.organization.timezone);
      const upcomingUntil = addDays(today, 7);
      const rows = await listEmployeePmTasks(context);
      const openRows = rows.filter((row) => !CLOSED_STATUSES.has(row.status));
      const projectLabels = await loadProjectDisplayNameMap(
        context.db,
        context.organizationId,
        openRows.map((row) => row.projectId).filter(Boolean) as string[],
      );

      tasks = openRows
        .map((row) => {
          let kind: HomeTaskKind | null = null;
          if (row.status === 'blocked') kind = 'blocked';
          else if (row.dueDate && row.dueDate < today) kind = 'overdue';
          else if (row.dueDate === today) kind = 'dueToday';
          else if (row.dueDate && row.dueDate > today && row.dueDate <= upcomingUntil) {
            kind = 'upcoming';
          }
          if (!kind) return null;
          return {
            id: row.id,
            title: row.title,
            dueDate: row.dueDate,
            status: row.status,
            projectLabel: row.projectId ? (projectLabels.get(row.projectId) ?? null) : null,
            kind,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .sort((a, b) => {
          const order: Record<HomeTaskKind, number> = {
            overdue: 0,
            dueToday: 1,
            blocked: 2,
            upcoming: 3,
          };
          const rankDiff = order[a.kind] - order[b.kind];
          if (rankDiff !== 0) return rankDiff;
          return (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
        })
        .slice(0, 8);
    }

    return {
      data: shell,
      taskSummary: summary,
      priorityTasks: tasks,
    };
  });

  return (
    <div className={employeePageStackClass}>
      <header>
        <h1 className="text-2xl font-bold">
          {t('greeting', { name: data.employeeName || t('home.anonymousName') })}
        </h1>
      </header>

      {taskSummary ? (
        <section className={cn(employeePanelClass, 'space-y-4')}>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">{t('home.workSummary.title')}</h2>
            <p className="text-xs text-[var(--pf-text-secondary)]">{t('home.workSummary.subtitle')}</p>
          </div>
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-[var(--pf-text-secondary)]">{t('home.workSummary.dueToday')}</dt>
              <dd className="text-2xl font-bold">{taskSummary.dueToday}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--pf-text-secondary)]">{t('home.workSummary.overdue')}</dt>
              <dd className={cn('text-2xl font-bold', taskSummary.overdue > 0 && 'text-red-600')}>
                {taskSummary.overdue}
              </dd>
            </div>
          </dl>

          {priorityTasks.length > 0 ? (
            <ul className={employeeListPanelClass}>
              {priorityTasks.map((task) => (
                <li key={task.id}>
                  <Link href={`/employee/tasks/${task.id}`} className={employeeListRowLinkClass}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{task.title}</p>
                        {task.projectLabel ? (
                          <p className="truncate text-xs text-[var(--pf-text-secondary)]">{task.projectLabel}</p>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                          task.kind === 'overdue'
                            ? 'bg-red-50 text-red-700'
                            : task.kind === 'dueToday'
                              ? 'bg-[var(--pf-accent-soft)] text-[var(--pf-accent)]'
                              : task.kind === 'blocked'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-secondary)]',
                        )}
                      >
                        {t(`home.workSummary.badges.${task.kind}`)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          <Link href="/employee/tasks" className="text-sm font-medium text-[var(--pf-primary)] hover:underline">
            {t('home.workSummary.viewTasks')}
          </Link>
        </section>
      ) : null}

      <EmployeeInstallButton />
    </div>
  );
}
