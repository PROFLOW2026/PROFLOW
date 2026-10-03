import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { loadProjectExecutionDashboard } from '@/modules/project-workspace/application/load-execution-dashboard';
import { ExecutionMetricCard } from '@/modules/project-workspace/ui/execution-metric-card';
import { withOrgContext } from '@/shared/auth/session';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export async function ProjectExecutionDashboardScreen({ surfaceRoot, params }: {
    surfaceRoot?: string;
 params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  const [t, metrics] = await Promise.all([
    getTranslations('projectWorkspace'),
    withOrgContext((context) => loadProjectExecutionDashboard(context, projectId)),
  ]);
  const unavailable = t('execution.metricUnavailable');
  const base = `${surfaceRoot ?? ('/projects/' + projectId)}`;

  const cards = [
    { key: 'coordinationUpcoming', label: t('execution.metrics.coordinationUpcoming'), href: `${base}/coordination`, metric: metrics.coordinationUpcoming },
    { key: 'coordinationBlocked', label: t('execution.metrics.coordinationBlocked'), href: `${base}/coordination`, metric: metrics.coordinationBlocked },
    { key: 'overdueTasks', label: t('execution.metrics.overdueTasks'), href: `${base}/activity?domain=task`, metric: metrics.overdueTasks },
    { key: 'openDefects', label: t('execution.metrics.openDefects'), href: `${base}/defects`, metric: metrics.openDefects },
    { key: 'overdueRfis', label: t('execution.metrics.overdueRfis'), href: `${base}/rfi?status=overdue`, metric: metrics.overdueRfis },
    { key: 'pendingSubmittals', label: t('execution.metrics.pendingSubmittals'), href: `${base}/submittals?status=pending`, metric: metrics.pendingSubmittals },
    { key: 'openInspections', label: t('execution.metrics.openInspections'), href: `${base}/inspections`, metric: metrics.openInspections },
  ] as const;

  return (
    <WithClientMessages extra={['projectWorkspace']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('execution.dashboard')} description={t('execution.dashboardDescription')} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <ExecutionMetricCard
              key={card.key}
              label={card.label}
              metric={card.metric}
              href={card.href}
              unavailableLabel={unavailable}
            />
          ))}
        </div>
      </div>
    </WithClientMessages>
  );
}

export default function ProjectExecutionDashboardPage(
  props: Omit<Parameters<typeof ProjectExecutionDashboardScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectExecutionDashboardScreen {...props} />;
}
