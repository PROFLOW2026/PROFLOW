import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeTeamRoster } from '@/modules/employee-app/application/employee-operational';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  employeeListPanelClass,
  employeeListRowClass,
  employeePageStackClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeTeamPage() {
  const t = await getTranslations('employeeApp.team');
  const { members, showWorkforceHubLink } = await withOrgContext(async (context) => {
    const showWorkforceHubLink =
      employeeHasPermission(context, PERMISSIONS.WORKFORCE_COST_READ) ||
      employeeHasPermission(context, PERMISSIONS.WORKFORCE_COST_MANAGE);
    return {
      members: await listEmployeeTeamRoster(context),
      showWorkforceHubLink,
    };
  });

  return (
    <div className={employeePageStackClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('intro')}</p>
        {showWorkforceHubLink ? (
          <Link
            href="/employee/workforce"
            className="text-xs font-semibold text-[var(--pf-accent)] hover:underline"
          >
            {t('workforceHubLink')}
          </Link>
        ) : null}
      </div>
      <ul className={employeeListPanelClass}>
        {members.map((member) => {
          const tasksHref = `/employee/tasks?scope=company&assignee=${encodeURIComponent(member.id)}&status=open`;
          return (
            <li key={member.id} className={employeeListRowClass}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--pf-text-primary)]">{member.name}</p>
                  {member.title ? (
                    <p className="text-xs text-[var(--pf-text-secondary)]">{member.title}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Link
                    href={tasksHref}
                    className="rounded-full border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--pf-text-primary)] transition-colors hover:border-[var(--pf-border-strong)] hover:bg-[var(--pf-bg-elevated)]"
                  >
                    {t('openTasks', { count: member.openTaskCount })}
                  </Link>
                  <Link
                    href={tasksHref}
                    className="text-xs font-medium text-[var(--pf-accent)] hover:underline"
                  >
                    {t('viewTasks')}
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
        {members.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
            {t('empty')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
