import { notFound } from 'next/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeePermissionScope } from '@/modules/employee-app/application/load-employee-app-context';
import { buildEmployeeTaskListPayload } from '@/modules/employee-app/application/build-employee-task-list-payload';
import { mapEmployeeTaskToCalendarCard } from '@/modules/employee-app/ui/map-employee-task-to-calendar-card';
import { employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';
import { EmployeeTasksCalendarClient } from './_employee-calendar-client';

export default async function EmployeeTasksCalendarPage() {
  const data = await withOrgContext(async (context) => {
    const pmScope = employeePermissionScope(context, PERMISSIONS.TASKS_READ);
    if (!pmScope) return null;
    const payload = await buildEmployeeTaskListPayload(context);
    if (!payload) return null;
    return {
      tasks: payload.tasks.map(mapEmployeeTaskToCalendarCard),
      today: payload.today,
    };
  });

  if (!data) notFound();

  return (
    <div className={employeePageStackClass}>
      <EmployeeTasksCalendarClient tasks={[...data.tasks]} today={data.today} />
    </div>
  );
}
