import { getTranslations } from 'next-intl/server';
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
        {members.map((member) => (
          <li key={member.id} className={employeeListRowClass}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--pf-text-primary)]">{member.name}</p>
                {member.title ? (
                  <p className="text-xs text-[var(--pf-text-secondary)]">{member.title}</p>
                ) : null}
              </div>
              <span className="rounded-full border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--pf-text-primary)]">
                {t('openTasks', { count: member.openTaskCount })}
              </span>
            </div>
          </li>
        ))}
        {members.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
            {t('empty')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
