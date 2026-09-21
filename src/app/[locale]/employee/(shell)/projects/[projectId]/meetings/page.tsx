import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { getEmployeeProjectTaskOverview } from '@/modules/employee-app/application/employee-pm-tasks';
import { listEmployeeProjectMeetings } from '@/modules/employee-app/application/employee-meetings';
import {
  employeeListPanelClass,
  employeeListRowClass,
  employeePageStackClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

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
    <div className={employeePageStackClass}>
      <p className="text-sm font-medium text-[var(--pf-text-secondary)]">{data.overview.displayName}</p>
      <ul className={employeeListPanelClass}>
        {data.meetings.map((meeting) => (
          <li key={meeting.id} className={employeeListRowClass}>
            <div className="space-y-1">
              <div className="font-semibold text-[var(--pf-text-primary)]">{meeting.title}</div>
              <div className="text-sm text-[var(--pf-text-secondary)]">
                {new Date(meeting.scheduledAt).toLocaleString(locale, {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })}
              </div>
              {meeting.location ? (
                <div className="text-xs text-[var(--pf-text-muted)]">{meeting.location}</div>
              ) : null}
            </div>
          </li>
        ))}
        {data.meetings.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-[var(--pf-text-secondary)]">
            {t('empty')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
