import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { getEmployeeProjectTaskOverview } from '@/modules/employee-app/application/employee-pm-tasks';
import {
  buildEmployeeProjectHubLinks,
  EmployeeProjectHubNav,
} from '@/modules/employee-app/ui/employee-project-hub-nav';
import {
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

  const { overview, hubLinks } = await withOrgContext(async (context) => {
    const overviewData = employeeHasPermission(context, PERMISSIONS.PROJECTS_READ)
      ? await getEmployeeProjectTaskOverview(context, projectId)
      : null;
    if (!overviewData) return { overview: null, hubLinks: [] as Awaited<ReturnType<typeof buildEmployeeProjectHubLinks>> };

    const links = await buildEmployeeProjectHubLinks({
      projectId,
      openTasks: overviewData.openTasks,
      canMeetings: employeeHasPermission(context, PERMISSIONS.MEETINGS_READ),
      canDocuments: employeeHasPermission(context, PERMISSIONS.DOCUMENTS_READ),
      canLogTime: employeeHasPermission(context, PERMISSIONS.TIME_MANAGE),
    });

    return { overview: overviewData, hubLinks: links };
  });

  if (!overview) notFound();

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

      <EmployeeProjectHubNav links={hubLinks} />
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
