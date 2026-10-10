import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import {
  listEmployeeTeamRoster,
  listEmployeeWorkforceHubRoster,
} from '@/modules/employee-app/application/employee-operational';
import {
  employeeListPanelClass,
  employeeListRowClass,
  employeePageStackClass,
} from '@/modules/employee-app/ui/employee-surface-styles';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export default async function EmployeeWorkforceHubPage() {
  const t = await getTranslations('employeeApp.workforceHub');

  const payload = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    const canCost =
      employeeHasPermission(context, PERMISSIONS.WORKFORCE_COST_READ) ||
      employeeHasPermission(context, PERMISSIONS.WORKFORCE_COST_MANAGE);
    const canWorkforceRead = employeeHasPermission(context, PERMISSIONS.WORKFORCE_READ);
    if (!canCost && !canWorkforceRead) return null;
    const members = canCost
      ? await listEmployeeWorkforceHubRoster(context)
      : await listEmployeeTeamRoster(context);
    return { members, canCost };
  });

  if (payload === null) notFound();
  const { members, canCost } = payload;

  return (
    <div className={employeePageStackClass}>
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('intro')}</p>
      <ul className={employeeListPanelClass}>
        {members.map((member) => (
          <li key={member.id} className={employeeListRowClass}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--pf-text-primary)]">{member.name}</p>
                {member.title ? (
                  <p className="text-xs text-[var(--pf-text-secondary)]">{member.title}</p>
                ) : null}
              </div>
              {canCost ? (
                <Link
                  href={`/employee/workforce/employees/${member.id}`}
                  className="shrink-0 rounded-full border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--pf-text-primary)] transition-colors hover:border-[var(--pf-border-strong)] hover:bg-[var(--pf-bg-elevated)]"
                >
                  {t('viewEmployerCost')}
                </Link>
              ) : null}
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
