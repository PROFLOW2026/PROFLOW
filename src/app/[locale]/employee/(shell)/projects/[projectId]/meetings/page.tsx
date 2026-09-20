import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { getEmployeeProjectTaskOverview } from '@/modules/employee-app/application/employee-pm-tasks';
import { listEmployeeProjectMeetings } from '@/modules/employee-app/application/employee-meetings';

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function EmployeeProjectMeetingsPage({ params }: PageProps) {
  const { projectId } = await params;
  const t = await getTranslations('employeeApp.meetings');
  const locale = await getLocale();

  const data = await withOrgContext(async (context) => {
    if (!employeeHasPermission(context, PERMISSIONS.MEETINGS_READ)) return null;
    const overview = await getEmployeeProjectTaskOverview(context, projectId);
    if (!overview) return null;
    const meetings = await listEmployeeProjectMeetings(context, projectId);
    return { overview, meetings };
  });

  if (!data) notFound();

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">{data.overview.name}</p>
      <ul className="divide-y divide-[var(--pf-border)] rounded-lg border border-[var(--pf-border)]">
        {data.meetings.map((meeting) => (
          <li key={meeting.id} className="px-4 py-3 text-sm space-y-1">
            <div className="font-medium">{meeting.title}</div>
            <div className="text-[var(--pf-text-secondary)]">
              {new Date(meeting.scheduledAt).toLocaleString(locale, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </div>
            {meeting.location ? (
              <div className="text-xs text-[var(--pf-text-muted)]">{meeting.location}</div>
            ) : null}
          </li>
        ))}
        {data.meetings.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
            {t('empty')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
