import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { authorize } from '@/shared/permissions/authorize';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeAssignedTasks } from '@/modules/employee-app';
import { buildEmployeeTaskListPayload } from '@/modules/employee-app/application/build-employee-task-list-payload';
import { employeePermissionScope } from '@/modules/employee-app/application/load-employee-app-context';
import { listEmployeePmCreatableProjects } from '@/modules/employee-app/application/employee-pm-tasks';
import { EmployeeTaskListView } from '@/modules/employee-app/ui/employee-task-list-view';
import {
  employeeListPanelClass,
  employeeListRowClass,
  employeePageStackClass,
  employeeTabBarClass,
  employeeTabClass,
} from '@/modules/employee-app/ui/employee-surface-styles';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function EmployeeTasksPage({ searchParams }: PageProps) {
  const t = await getTranslations('employeeApp.tasks');
  const tLists = await getTranslations('employeeApp.lists');
  const { tab } = await searchParams;

  const { punchTasks, taskPayload, hasPmTasksAccess, canCreateTask } = await withOrgContext(async (context) => {
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
    const taskPayload = hasPmTasksAccess && tab !== 'field-items'
      ? await buildEmployeeTaskListPayload(context)
      : null;

    const creatableProjects = hasPmTasksAccess
      ? await listEmployeePmCreatableProjects(context)
      : [];

    return { punchTasks, taskPayload, hasPmTasksAccess, canCreateTask: creatableProjects.length > 0 };
  });

  const activeTab = hasPmTasksAccess
    ? tab === 'field-items'
      ? 'field-items'
      : 'pm-tasks'
    : 'field-items';

  return (
    <div className={employeePageStackClass}>
      {hasPmTasksAccess && (
        <div className={employeeTabBarClass}>
          <Link href="/employee/tasks" className={cn(employeeTabClass(activeTab === 'pm-tasks'))}>
            {t('tabs.pmTasks')}
          </Link>
          <Link
            href="/employee/tasks?tab=field-items"
            className={cn(
              employeeTabClass(activeTab === 'field-items'),
              'border-s border-[var(--pf-border-default)]',
            )}
          >
            {t('tabs.fieldItems')}
          </Link>
        </div>
      )}

      {activeTab === 'pm-tasks' && taskPayload ? (
        <Suspense fallback={null}>
          <EmployeeTaskListView
            tasks={taskPayload.tasks}
            today={taskPayload.today}
            currentEmployeeId={taskPayload.currentEmployeeId}
            canFilterByAssignee={taskPayload.canFilterByAssignee}
            canSeeCompanyScope={taskPayload.canSeeCompanyScope}
            assigneeOptions={taskPayload.assigneeOptions}
            projectOptions={taskPayload.projectOptions}
            createTaskHref={canCreateTask ? '/employee/tasks/new' : null}
          />
        </Suspense>
      ) : null}

      {activeTab === 'field-items' && (
        <ul className={employeeListPanelClass}>
          {punchTasks.map((task) => (
            <li key={task.id} className={employeeListRowClass}>
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
