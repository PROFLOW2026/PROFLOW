import { getTranslations } from 'next-intl/server';
import { authorize } from '@/shared/permissions/authorize';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeAssignedTasks } from '@/modules/employee-app';
import { listEmployeePmTasks } from '@/modules/employee-app/application/employee-pm-tasks';
import { employeePermissionScope } from '@/modules/employee-app/application/load-employee-app-context';
import {
  assigneeDisplaysForTask,
  loadTaskAssigneeDisplayMap,
} from '@/modules/tasks/application/enrich-task-assignees';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

const STATUS_COLOR: Record<string, string> = {
  todo: 'bg-[var(--pf-surface-2)] text-[var(--pf-text-secondary)]',
  in_progress: 'bg-blue-100 text-blue-700',
  in_review: 'bg-purple-100 text-purple-700',
  done: 'bg-green-100 text-green-700',
  cancelled: 'bg-[var(--pf-surface-2)] text-[var(--pf-text-muted)] line-through',
  blocked: 'bg-red-100 text-red-700',
};

export default async function EmployeeTasksPage({ searchParams }: PageProps) {
  const t = await getTranslations('employeeApp.tasks');
  const tLists = await getTranslations('employeeApp.lists');
  const { tab } = await searchParams;

  const { punchTasks, pmTasks, pmAssigneesByTaskId, hasPmTasksAccess } = await withOrgContext(async (context) => {
    let punchTasks: Array<{ id: string; title: string; status: string; projectId: string | null }> = [];
    if (
      !context.permissions.has(PERMISSIONS.FIELD_OPS_READ) &&
      !context.employeeApp?.grants.has(PERMISSIONS.FIELD_OPS_READ)
    ) {
      try {
        await authorize(context, { permission: PERMISSIONS.SERVICE_READ, scope: 'assigned_only' });
        punchTasks = await listEmployeeAssignedTasks(context);
      } catch {
        // no field_ops or service access — empty list
      }
    } else {
      try {
        await authorize(context, { permission: PERMISSIONS.FIELD_OPS_READ, scope: 'assigned_only' });
        punchTasks = await listEmployeeAssignedTasks(context);
      } catch {
        // no access — empty list
      }
    }

    const pmScope = employeePermissionScope(context, PERMISSIONS.TASKS_READ);
    const hasPmTasksAccess = pmScope !== null;
    let pmTasks: Awaited<ReturnType<typeof listEmployeePmTasks>> = [];
    let pmAssigneesByTaskId: Record<string, string> = {};
    if (hasPmTasksAccess && tab !== 'field-items') {
      pmTasks = await listEmployeePmTasks(context);
      const assigneeMap = await loadTaskAssigneeDisplayMap(
        context.db,
        context.organizationId,
        pmTasks.map((task) => task.id),
      );
      pmAssigneesByTaskId = Object.fromEntries(
        pmTasks.map((task) => [
          task.id,
          assigneeDisplaysForTask(task.id, assigneeMap)
            .map((assignee) => assignee.displayName)
            .filter(Boolean)
            .join(', '),
        ]),
      );
    }

    return { punchTasks, pmTasks, pmAssigneesByTaskId, hasPmTasksAccess };
  });

  const activeTab = hasPmTasksAccess
    ? (tab === 'field-items' ? 'field-items' : 'pm-tasks')
    : 'field-items';

  return (
    <div className="space-y-4">
      {hasPmTasksAccess && (
        <div className="flex overflow-hidden rounded-lg border border-[var(--pf-border)] text-sm font-medium">
          <Link
            href="/employee/tasks"
            className={cn(
              'flex-1 py-2.5 text-center transition-colors',
              activeTab === 'pm-tasks'
                ? 'bg-[var(--pf-primary)] text-white'
                : 'bg-[var(--pf-surface)] text-[var(--pf-text-secondary)] hover:bg-[var(--pf-surface-2)]',
            )}
          >
            {t('tabs.pmTasks')}
          </Link>
          <Link
            href="/employee/tasks?tab=field-items"
            className={cn(
              'flex-1 border-s border-[var(--pf-border)] py-2.5 text-center transition-colors',
              activeTab === 'field-items'
                ? 'bg-[var(--pf-primary)] text-white'
                : 'bg-[var(--pf-surface)] text-[var(--pf-text-secondary)] hover:bg-[var(--pf-surface-2)]',
            )}
          >
            {t('tabs.fieldItems')}
          </Link>
        </div>
      )}

      {activeTab === 'pm-tasks' && (
        <ul className="divide-y divide-[var(--pf-border)] rounded-lg border border-[var(--pf-border)]">
          {pmTasks.map((task) => (
            <li key={task.id}>
              <Link
                href={`/employee/tasks/${task.id}`}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--pf-surface-2)]"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-sm font-medium leading-snug">{task.title}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        STATUS_COLOR[task.status] ?? STATUS_COLOR.todo,
                      )}
                    >
                      {t(`status.${task.status}`, { defaultValue: task.status })}
                    </span>
                    {task.priority && task.priority !== 'none' ? (
                      <span className="text-xs text-[var(--pf-text-muted)]">
                        {t(`priority.${task.priority}`, { defaultValue: task.priority })}
                      </span>
                    ) : null}
                    {task.dueDate ? (
                      <span className="text-xs text-[var(--pf-text-muted)]">
                        {t('dueDate', { date: task.dueDate })}
                      </span>
                    ) : null}
                    {pmAssigneesByTaskId[task.id] ? (
                      <span className="text-xs text-[var(--pf-text-secondary)]">
                        {pmAssigneesByTaskId[task.id]}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
          {pmTasks.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-[var(--pf-text-secondary)]">
              {t('emptyPmTasks')}
            </li>
          ) : null}
        </ul>
      )}

      {activeTab === 'field-items' && (
        <ul className="divide-y divide-[var(--pf-border)] rounded-lg border border-[var(--pf-border)]">
          {punchTasks.map((task) => (
            <li key={task.id} className="px-4 py-3 text-sm">
              <div className="font-medium">{task.title}</div>
              <div className="text-[var(--pf-text-secondary)]">{task.status}</div>
            </li>
          ))}
          {punchTasks.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
              {tLists('tasksEmpty')}
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
