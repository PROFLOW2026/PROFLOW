import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { requireDeveloperGcExecutionPage } from '@/modules/project-workspace/server/require-developer-gc-execution';
import { loadProjectExecutionDashboard } from '@/modules/project-workspace/application/load-execution-dashboard';
import { loadProjectContractorList } from '@/modules/project-workspace/application/load-project-contractors';
import { ExecutionMetricCard } from '@/modules/project-workspace/ui/execution-metric-card';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import { formatMoneyString } from '@/shared/money';

export async function ProjectExecutionDashboardScreen({ surfaceRoot, params }: {
    surfaceRoot?: string;
 params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireDeveloperGcExecutionPage(projectId);
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  const [t, locale, bundle] = await Promise.all([
    getTranslations('projectWorkspace'),
    getLocale(),
    withOrgContext(async (context) => {
      const [metrics, contractors] = await Promise.all([
        loadProjectExecutionDashboard(context, projectId),
        loadProjectContractorList(context, projectId, { surfaceRoot }),
      ]);
      return { metrics, contractors };
    }),
  ]);
  const { metrics, contractors } = bundle;
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
    <WithAppClientMessages extra={['projectWorkspace']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('execution.dashboard')} description={t('execution.dashboardDescription')} />
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${base}/structure`}
            className="inline-flex min-h-11 items-center rounded-md border border-[var(--pf-border-default)] px-3 text-sm font-medium"
          >
            {t('execution.hubLinks.structure')}
          </Link>
          <Link
            href={`${base}/team`}
            className="inline-flex min-h-11 items-center rounded-md border border-[var(--pf-border-default)] px-3 text-sm font-medium"
          >
            {t('execution.hubs.team')}
          </Link>
          <Link
            href={`${base}/contractor-payments`}
            className="inline-flex min-h-11 items-center rounded-md border border-[var(--pf-border-default)] px-3 text-sm font-medium"
          >
            {t('execution.hubs.payments')}
          </Link>
          <Link
            href={`${base}/cost-control`}
            className="inline-flex min-h-11 items-center rounded-md border border-[var(--pf-border-default)] px-3 text-sm font-medium"
          >
            {t('execution.hubLinks.costControl')}
          </Link>
        </div>
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
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">{t('contractors.pageTitle')}</h2>
            <p className="text-sm text-[var(--pf-text-secondary)]">
              {t('contractors.countSummary', { count: contractors.items.length })}
            </p>
          </div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {contractors.items.map((item) => (
              <li key={item.agreement.id}>
                <Link
                  href={item.detailHref}
                  className="flex min-h-11 flex-col gap-1 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 hover:bg-[var(--pf-bg-muted)]"
                >
                  <span className="font-medium">{item.agreement.title}</span>
                  <span className="text-sm text-[var(--pf-text-secondary)]">
                    {[item.agreement.trade, item.agreement.status, item.portal?.username]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {contractors.canViewFinancial && item.committedAmount && item.currency ? (
                    <span className="text-sm tabular-nums">
                      {t('contractors.committed')}: {formatMoneyString(item.committedAmount, item.currency, locale)}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </WithAppClientMessages>
  );
}

export default function ProjectExecutionDashboardPage(
  props: Omit<Parameters<typeof ProjectExecutionDashboardScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectExecutionDashboardScreen {...props} />;
}
