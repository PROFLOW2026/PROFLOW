import { getTranslations } from 'next-intl/server';
import { authorize } from '@/shared/permissions/authorize';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { resolveLinkedEmployee } from '@/modules/workforce/application/time-scope';
import { listAttendanceDays } from '@/modules/workforce';

export default async function EmployeeAttendancePage() {
  const t = await getTranslations('employeeApp');
  const rows = await withOrgContext(async (context) => {
    await authorize(context, { permission: PERMISSIONS.ATTENDANCE_SELF, scope: 'self_only' });
    const employee = await resolveLinkedEmployee(context);
    if (!employee) return [];
    return listAttendanceDays(context.db, context.organizationId, {
      employeeId: employee.id,
    });
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('nav.attendance')}</h1>
      <ul className="divide-y divide-[var(--pf-border)] rounded-lg border border-[var(--pf-border)]">
        {rows.map((day) => (
          <li key={day.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>{day.workDate}</span>
            <span className="text-[var(--pf-text-secondary)]">{day.status}</span>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">—</li>
        ) : null}
      </ul>
    </div>
  );
}
