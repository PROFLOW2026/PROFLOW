import { getLocale, getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { listEmployeeMeetings } from '@/modules/employee-app/application/employee-meetings';

export default async function EmployeeMeetingsPage() {
  const t = await getTranslations('employeeApp.meetings');
  const locale = await getLocale();

  const meetings = await withOrgContext(async (context) => {
    if (!employeeHasPermission(context, PERMISSIONS.MEETINGS_READ)) return [];
    return listEmployeeMeetings(context);
  });

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-[var(--pf-border)] rounded-lg border border-[var(--pf-border)]">
        {meetings.map((meeting) => (
          <li key={meeting.id} className="px-4 py-3 text-sm space-y-1">
            <div className="font-medium">{meeting.title}</div>
            <div className="text-[var(--pf-text-secondary)]">
              {new Date(meeting.scheduledAt).toLocaleString(locale, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </div>
            {meeting.projectName ? (
              <div className="text-xs text-[var(--pf-text-muted)]">{meeting.projectName}</div>
            ) : null}
          </li>
        ))}
        {meetings.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
            {t('empty')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
