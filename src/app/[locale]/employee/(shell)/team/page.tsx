import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeTeamRoster } from '@/modules/employee-app/application/employee-operational';
import {
  employeeListPanelClass,
  employeeListRowClass,
  employeePageStackClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeTeamPage() {
  const t = await getTranslations('employeeApp.team');
  const members = await withOrgContext(async (context) => listEmployeeTeamRoster(context));

  return (
    <div className={employeePageStackClass}>
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('intro')}</p>
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
