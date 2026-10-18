import { Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeTeamRoster } from '@/modules/employee-app/application/employee-operational';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { EmployeeEmptyState } from '@/modules/employee-app/ui/employee-empty-state';
import {
  employeeIconTileClass,
  employeeMetaChipClass,
  employeeOfficeListPanelClass,
  employeeOfficePageStackClass,
  employeePageSubtitleClass,
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
    <div className={employeeOfficePageStackClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={employeePageSubtitleClass}>{t('intro')}</p>
        {showWorkforceHubLink ? (
          <Link
            href="/employee/workforce"
            className="text-xs font-semibold text-[var(--pf-accent)] hover:underline"
          >
            {t('workforceHubLink')}
          </Link>
        ) : null}
      </div>
      {members.length > 0 ? (
        <ul className={employeeOfficeListPanelClass}>
          {members.map((member) => {
            const tasksHref = `/employee/tasks?scope=company&assignee=${encodeURIComponent(member.id)}&status=open`;
            return (
              <li
                key={member.id}
                className="flex items-center gap-3 bg-[var(--pf-bg-surface)] px-4 py-2.5 text-sm transition-colors hover:bg-[var(--pf-bg-subtle)] md:px-4 md:py-2"
              >
                <span className={employeeIconTileClass} aria-hidden>
                  <Users className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--pf-text-primary)]">
                    {member.name}
                  </p>
                  {member.title ? (
                    <p className="truncate text-xs text-[var(--pf-text-secondary)]">{member.title}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Link href={tasksHref} className={employeeMetaChipClass}>
                    {t('openTasks', { count: member.openTaskCount })}
                  </Link>
                  <Link
                    href={tasksHref}
                    className="text-xs font-semibold text-[var(--pf-accent)] hover:underline"
                  >
                    {t('viewTasks')}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmployeeEmptyState title={t('empty')} icon={Users} />
      )}
    </div>
  );
}
