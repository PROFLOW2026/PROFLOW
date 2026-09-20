import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeTeamRoster } from '@/modules/employee-app/application/employee-operational';

export default async function EmployeeTeamPage() {
  const t = await getTranslations('employeeApp.team');
  const members = await withOrgContext(async (context) => listEmployeeTeamRoster(context));

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('intro')}</p>
      <ul className="divide-y divide-[var(--pf-border)] rounded-lg border border-[var(--pf-border)]">
        {members.map((member) => (
          <li key={member.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{member.name}</p>
                {member.title ? (
                  <p className="text-xs text-[var(--pf-text-secondary)]">{member.title}</p>
                ) : null}
              </div>
              <span className="rounded-full bg-[var(--pf-surface-2)] px-2 py-1 text-xs">
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
