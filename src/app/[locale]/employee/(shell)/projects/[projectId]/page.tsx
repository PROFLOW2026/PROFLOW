import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { getEmployeeProjectTaskOverview } from '@/modules/employee-app/application/employee-pm-tasks';
import { Link } from '@/shared/i18n/navigation';
import {
  employeeHubCardClass,
  employeePageStackClass,
  employeeStatCardClass,
} from '@/modules/employee-app/ui/employee-surface-styles';
import { cn } from '@/shared/ui/cn';

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function EmployeeProjectOverviewPage({ params }: PageProps) {
  const { projectId } = await params;
  const t = await getTranslations('employeeApp.projects');

  const { overview, canMeetings, canDocuments } = await withOrgContext(async (context) => ({
    overview: employeeHasPermission(context, PERMISSIONS.PROJECTS_READ)
      ? await getEmployeeProjectTaskOverview(context, projectId)
      : null,
    canMeetings: employeeHasPermission(context, PERMISSIONS.MEETINGS_READ),
    canDocuments: employeeHasPermission(context, PERMISSIONS.DOCUMENTS_READ),
  }));

  if (!overview) notFound();

  const links = [
    {
      href: `/employee/projects/${projectId}/tasks`,
      label: t('hub.tasks'),
      count: overview.openTasks,
      visible: true,
    },
    {
      href: `/employee/projects/${projectId}/board`,
      label: t('hub.board'),
      count: overview.openTasks,
      visible: true,
    },
    {
      href: `/employee/projects/${projectId}/files`,
      label: t('hub.files'),
      visible: canDocuments,
    },
    {
      href: `/employee/projects/${projectId}/meetings`,
      label: t('hub.meetings'),
      visible: canMeetings,
    },
  ];

  return (
    <div className={employeePageStackClass}>
      <header className="space-y-1">
        <h2 className="text-xl font-bold text-[var(--pf-text-primary)]">{overview.displayName}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('overview.subtitle')}</p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t('stats.totalTasks')} value={overview.totalTasks} />
        <StatCard label={t('stats.openTasks')} value={overview.openTasks} />
        <StatCard label={t('stats.dueToday')} value={overview.dueToday} />
        <StatCard
          label={t('stats.overdue')}
          value={overview.overdue}
          highlight={overview.overdue > 0}
        />
      </dl>

      <nav className="grid gap-2" aria-label={t('overview.subtitle')}>
        {links
          .filter((link) => link.visible)
          .map((link) => (
            <Link key={link.href} href={link.href} className={employeeHubCardClass}>
              <span className="text-base font-semibold text-[var(--pf-text-primary)]">{link.label}</span>
              {'count' in link && link.count !== undefined ? (
                <span className="rounded-full border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--pf-text-primary)]">
                  {link.count}
                </span>
              ) : (
                <span className="text-sm text-[var(--pf-text-muted)]" aria-hidden>
                  →
                </span>
              )}
            </Link>
          ))}
      </nav>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className={employeeStatCardClass}>
      <dt className="text-xs font-medium text-[var(--pf-text-secondary)]">{label}</dt>
      <dd className={cn('mt-1 text-2xl font-bold text-[var(--pf-text-primary)]', highlight && value > 0 && 'text-red-600')}>
        {value}
      </dd>
    </div>
  );
}
