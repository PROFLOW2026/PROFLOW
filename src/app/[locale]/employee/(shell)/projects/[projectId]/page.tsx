import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { getEmployeeProjectTaskOverview } from '@/modules/employee-app/application/employee-pm-tasks';
import { Link } from '@/shared/i18n/navigation';
import { pressableCardLinkClassName } from '@/components/ui/pressable';
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
    { href: `/employee/projects/${projectId}/tasks`, label: t('hub.tasks'), visible: true },
    { href: `/employee/projects/${projectId}/board`, label: t('hub.board'), visible: true },
    { href: `/employee/projects/${projectId}/files`, label: t('hub.files'), visible: canDocuments },
    {
      href: `/employee/projects/${projectId}/meetings`,
      label: t('hub.meetings'),
      visible: canMeetings,
    },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-bold">{overview.name}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('overview.subtitle')}</p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t('stats.totalTasks')} value={overview.totalTasks} />
        <StatCard label={t('stats.openTasks')} value={overview.openTasks} />
        <StatCard label={t('stats.dueToday')} value={overview.dueToday} />
        <StatCard label={t('stats.overdue')} value={overview.overdue} highlight={overview.overdue > 0} />
      </dl>

      <nav className="grid gap-2">
        {links
          .filter((link) => link.visible)
          .map((link) => (
            <Link key={link.href} href={link.href} className={cn(pressableCardLinkClassName, 'block px-4 py-3 text-sm font-medium')}>
              {link.label}
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
    <div className="rounded-xl border border-[var(--pf-border)] bg-[var(--pf-surface)] p-3">
      <dt className="text-xs text-[var(--pf-text-secondary)]">{label}</dt>
      <dd className={cn('mt-1 text-2xl font-bold', highlight && value > 0 && 'text-red-600')}>{value}</dd>
    </div>
  );
}
