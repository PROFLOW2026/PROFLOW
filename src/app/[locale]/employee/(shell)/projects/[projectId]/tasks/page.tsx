import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeePermissionScope } from '@/modules/employee-app/application/load-employee-app-context';
import {
  getEmployeeProjectTaskOverview,
  listEmployeePmCreatableProjects,
} from '@/modules/employee-app/application/employee-pm-tasks';
import { buildEmployeeTaskListPayload } from '@/modules/employee-app/application/build-employee-task-list-payload';
import { EmployeeTaskListView } from '@/modules/employee-app/ui/employee-task-list-view';
import { employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function EmployeeProjectTasksPage({ params }: PageProps) {
  const { projectId } = await params;

  const data = await withOrgContext(async (context) => {
    const pmScope = employeePermissionScope(context, PERMISSIONS.TASKS_READ);
    if (!pmScope) return null;
    const overview = await getEmployeeProjectTaskOverview(context, projectId);
    if (!overview) return null;
    const payload = await buildEmployeeTaskListPayload(context, { projectId });
    if (!payload) return null;
    const creatableProjects = await listEmployeePmCreatableProjects(context);
    const canCreate = creatableProjects.some((project) => project.id === projectId);
    return { overview, payload, canCreate };
  });

  if (!data) notFound();

  return (
    <div className={employeePageStackClass}>
      <p className="text-sm font-medium text-[var(--pf-text-secondary)]">{data.overview.displayName}</p>
      <Suspense fallback={null}>
        <EmployeeTaskListView
          tasks={data.payload.tasks}
          hasMore={data.payload.hasMore}
          today={data.payload.today}
          currentEmployeeId={data.payload.currentEmployeeId}
          canFilterByAssignee={data.payload.canFilterByAssignee}
          canSeeCompanyScope={data.payload.canSeeCompanyScope}
          assigneeOptions={data.payload.assigneeOptions}
          projectOptions={data.payload.projectOptions}
          hideProjectFilter
          hideProjectColumn
          createTaskHref={
            data.canCreate ? `/employee/tasks/new?projectId=${projectId}` : null
          }
        />
      </Suspense>
    </div>
  );
}
