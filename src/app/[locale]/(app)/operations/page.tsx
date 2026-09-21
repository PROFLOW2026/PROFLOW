import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AlertTriangle, BarChart2, Calendar, CheckSquare, Clock, Package, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { getOperationsDashboard } from '@/modules/operations';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import {
  uwmSecondaryPanelClass,
  uwmSectionHeadingClass,
  uwmStatCardClass,
} from '@/shared/ui/uwm-surface-styles';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'operations' });
  return { title: t('title') };
}

export default async function OperationsDashboardPage() {
  const shell = await getShellContext();

  if (!shell?.permissions.has(PERMISSIONS.OPERATIONS_READ) || !shell.modules.work_management) {
    notFound();
  }

  const [t, tTasks] = await Promise.all([
    getTranslations('operations'),
    getTranslations('tasks'),
  ]);
  const data = await withOrgContext((context) => getOperationsDashboard(context));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader title={t('pageTitle')} description={t('pageDescription')} />

      <section>
        <h2 className={cn('mb-3', uwmSectionHeadingClass)}>{t('sections.projects')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard
            icon={<Package className="h-4 w-4" />}
            label={t('stats.activeProjects')}
            value={data.projects.activeCount}
            href="/projects?facet=active"
          />
          {data.projects.byStage.slice(0, 3).map((stage) => (
            <StatCard
              key={stage.stageName}
              icon={<BarChart2 className="h-4 w-4" />}
              label={stage.stageName}
              value={stage.count}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className={cn('mb-3', uwmSectionHeadingClass)}>{t('sections.taskHealth')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            icon={<Calendar className="h-4 w-4" />}
            label={t('stats.dueToday')}
            value={data.taskCounts.dueToday}
            variant={data.taskCounts.dueToday > 0 ? 'warning' : 'default'}
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label={t('stats.overdue')}
            value={data.taskCounts.overdue}
            variant={data.taskCounts.overdue > 0 ? 'danger' : 'default'}
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label={t('stats.blocked')}
            value={data.taskCounts.blocked}
            variant={data.taskCounts.blocked > 0 ? 'warning' : 'default'}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={uwmSecondaryPanelClass}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Calendar className="h-4 w-4 text-[var(--pf-text-secondary)]" />
            {t('sections.upcomingMilestones')}
          </h2>
          {data.upcomingMilestones.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('empty.milestones')}</p>
          ) : (
            <ul className="space-y-2">
              {data.upcomingMilestones.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.name}</p>
                    <p className="truncate text-xs text-[var(--pf-text-secondary)]">
                      <Link href={`/projects/${m.projectId}`} className="hover:underline">
                        {m.projectName}
                      </Link>
                    </p>
                  </div>
                  <time
                    dateTime={m.dueDate}
                    className={`shrink-0 text-xs font-mono ${m.dueDate <= today ? 'text-red-600' : 'text-[var(--pf-text-secondary)]'}`}
                  >
                    {m.dueDate}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={uwmSecondaryPanelClass}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CheckSquare className="h-4 w-4 text-[var(--pf-text-secondary)]" />
            {t('sections.pendingApprovals')}
          </h2>
          <div className="flex items-center gap-4">
            <span
              className={`text-3xl font-bold tabular-nums ${data.pendingApprovalCount > 0 ? 'text-amber-600' : 'text-[var(--pf-text-primary)]'}`}
            >
              {data.pendingApprovalCount}
            </span>
            {data.pendingApprovalCount > 0 ? (
              <Link href="/approvals" className="text-sm text-[var(--pf-accent)] hover:underline">
                {t('approvals.viewAll')}
              </Link>
            ) : (
              <span className="text-sm text-[var(--pf-text-muted)]">{t('approvals.allClear')}</span>
            )}
          </div>
        </section>
      </div>

      {data.staleProjects.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            {t('sections.staleProjects')}
          </h2>
          <ul className="space-y-1">
            {data.staleProjects.map((project) => (
              <li key={project.id} className="flex items-center justify-between gap-2 text-sm">
                <Link
                  href={`/projects/${project.id}`}
                  className="truncate font-medium hover:underline"
                >
                  {project.name}
                </Link>
                <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-[var(--pf-text-secondary)]">
                  {tTasks(`portfolio.status.${project.status}` as 'portfolio.status.active')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.teamWorkload && data.teamWorkload.length > 0 && (
        <section className={uwmSecondaryPanelClass}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-[var(--pf-text-secondary)]" />
            {t('sections.teamWorkload')}
          </h2>
          <ul className="space-y-2">
            {data.teamWorkload.map((entry) => (
              <li key={entry.employeeId} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{entry.employeeName}</span>
                <span className="shrink-0 rounded-full bg-[var(--pf-badge-bg)] px-2 py-0.5 text-xs font-semibold">
                  {t('workload.openTasks', { count: entry.openTaskCount })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.recentActivity.length > 0 && (
        <section className={uwmSecondaryPanelClass}>
          <h2 className="mb-3 text-sm font-semibold">{t('sections.recentActivity')}</h2>
          <ul className="space-y-2">
            {data.recentActivity.map((event) => (
              <li key={event.id} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{event.taskTitle}</p>
                  <p className="text-xs text-[var(--pf-text-secondary)]">
                    {event.eventType.replace(/_/g, ' ')}
                    {event.workspaceName ? ` · ${event.workspaceName}` : ''}
                    {event.projectName ? ` · ${event.projectName}` : ''}
                  </p>
                </div>
                <time
                  dateTime={event.occurredAt.toISOString()}
                  className="shrink-0 text-xs text-[var(--pf-text-muted)]"
                >
                  {formatRelativeTime(event.occurredAt, t)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

interface StatCardProps {
  icon?: React.ReactNode;
  label: string;
  value: number;
  href?: string;
  variant?: 'default' | 'warning' | 'danger';
}

function StatCard({ icon, label, value, href, variant = 'default' }: StatCardProps) {
  const valueClass =
    variant === 'danger'
      ? 'text-red-600 dark:text-red-400'
      : variant === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-[var(--pf-text-primary)]';

  const content = (
    <div className={cn(uwmStatCardClass, variant === 'danger' && 'border-red-200', variant === 'warning' && 'border-amber-200')}>
      <div className="flex items-center gap-1.5 text-xs text-[var(--pf-text-secondary)]">
        {icon}
        <span>{label}</span>
      </div>
      <span className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block no-underline">
        {content}
      </Link>
    );
  }

  return content;
}

type RelativeTimeTranslator = (
  key: 'relativeTime.justNow' | 'relativeTime.minutesAgo' | 'relativeTime.hoursAgo' | 'relativeTime.daysAgo',
  values?: { count: number },
) => string;

function formatRelativeTime(date: Date, t: RelativeTimeTranslator): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return t('relativeTime.justNow');
  if (diffMins < 60) return t('relativeTime.minutesAgo', { count: diffMins });
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return t('relativeTime.hoursAgo', { count: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  return t('relativeTime.daysAgo', { count: diffDays });
}
