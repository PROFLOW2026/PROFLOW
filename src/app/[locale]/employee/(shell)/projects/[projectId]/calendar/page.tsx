import { notFound } from 'next/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeePermissionScope } from '@/modules/employee-app/application/load-employee-app-context';
import { buildEmployeeTaskListPayload } from '@/modules/employee-app/application/build-employee-task-list-payload';
import { getEmployeeProjectTaskOverview } from '@/modules/employee-app/application/employee-pm-tasks';
import { mapEmployeeTaskToCalendarCard } from '@/modules/employee-app/ui/map-employee-task-to-calendar-card';
import { employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';
import { EmployeeTasksCalendarClient } from '../../../tasks/calendar/_employee-calendar-client';

export default async function EmployeeProjectCalendarPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const data = await withOrgContext(async (context) => {
    const pmScope = employeePermissionScope(context, PERMISSIONS.TASKS_READ);
    if (!pmScope) return null;
    const overview = await getEmployeeProjectTaskOverview(context, projectId);
    if (!overview) return null;
    const payload = await buildEmployeeTaskListPayload(context, { projectId });
    if (!payload) return null;
    return {
      overview,
      tasks: payload.tasks.map(mapEmployeeTaskToCalendarCard),
      today: payload.today,
    };
  });

  if (!data) notFound();

  return (
    <div className={employeePageStackClass}>
      <p className="text-sm font-medium text-[var(--pf-text-secondary)]">{data.overview.displayName}</p>
      <EmployeeTasksCalendarClient tasks={[...data.tasks]} today={data.today} />
    </div>
  );
}
