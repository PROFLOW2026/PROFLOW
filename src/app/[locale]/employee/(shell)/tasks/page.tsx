import { authorize } from '@/shared/permissions/authorize';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeAssignedTasks } from '@/modules/employee-app';

export default async function EmployeeTasksPage() {
  const tasks = await withOrgContext(async (context) => {
    if (
      !context.permissions.has(PERMISSIONS.FIELD_OPS_READ) &&
      !context.employeeApp?.grants.has(PERMISSIONS.FIELD_OPS_READ)
    ) {
      await authorize(context, { permission: PERMISSIONS.SERVICE_READ, scope: 'assigned_only' });
    } else {
      await authorize(context, { permission: PERMISSIONS.FIELD_OPS_READ, scope: 'assigned_only' });
    }
    return listEmployeeAssignedTasks(context);
  });

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-[var(--pf-border)] rounded-lg border border-[var(--pf-border)]">
        {tasks.map((task) => (
          <li key={task.id} className="px-4 py-3 text-sm">
            <div className="font-medium">{task.title}</div>
            <div className="text-[var(--pf-text-secondary)]">{task.status}</div>
          </li>
        ))}
        {tasks.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">—</li>
        ) : null}
      </ul>
    </div>
  );
}
