import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { loadExecutionPayableTotals } from '@/modules/project-workspace/application/load-execution-financials';
import { loadProjectExecutionDashboard } from '@/modules/project-workspace/application/load-execution-dashboard';
import {
  loadProjectContractorList,
  type ProjectContractorListItem,
} from '@/modules/project-workspace/application/load-project-contractors';
import { ExecutionMetricCard } from '@/modules/project-workspace/ui/execution-metric-card';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';
import { formatMoneyString, money, sumMoney } from '@/shared/money';

function commitmentTotal(
  items: readonly ProjectContractorListItem[],
): { amount: string; currency: string } | null {
  const priced = items.filter((item) => item.committedAmount && item.currency);
  if (priced.length === 0) return null;
  const currency = priced[0]!.currency!;
  if (priced.some((item) => item.currency !== currency)) return null;
  const total = sumMoney(
    priced.map((item) => money(item.committedAmount!, currency)),
    currency,
  );
  return { amount: total.amount, currency };
}

export async function ProjectExecutionDashboardScreen({ surfaceRoot, params }: {
    surfaceRoot?: string;
 params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  const [t, locale, bundle] = await Promise.all([
    getTranslations('projectWorkspace'),
    getLocale(),
    withOrgContext(async (context) => {
      const [metrics, contractors, payables] = await Promise.all([
        loadProjectExecutionDashboard(context, projectId),
        loadProjectContractorList(context, projectId, { surfaceRoot }),
        loadExecutionPayableTotals(context, projectId),
      ]);
      return { metrics, contractors, payables };
    }),
  ]);
  const { metrics, contractors, payables } = bundle;
  const commitments = contractors.canViewFinancial ? commitmentTotal(contractors.items) : null;
  const showFinancial = commitments !== null || payables !== null;
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
        {showFinancial ? (
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">{t('execution.financialTitle')}</h2>
              <Link href={`${base}/cost-control`} className="text-sm font-medium text-[var(--pf-text-brand)] hover:underline">
                {t('execution.openCostControl')}
              </Link>
            </div>
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('execution.financialHint')}</p>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {commitments ? (
                <div className="rounded-lg border border-[var(--pf-border-default)] p-3">
                  <dt className="text-sm text-[var(--pf-text-secondary)]">{t('execution.financialCommitments')}</dt>
                  <dd className="mt-1 font-medium tabular-nums">{formatMoneyString(commitments.amount, commitments.currency, locale)}</dd>
                </div>
              ) : null}
              {payables ? (
                <>
                  {(
                    [
                      ['financialCertified', payables.certified],
                      ['financialRetention', payables.retention],
                      ['financialAdvances', payables.advances],
                      ['financialDeductions', payables.deductions],
                      ['financialPayable', payables.payableNet],
                    ] as const
                  ).map(([key, amount]) => (
                    <div key={key} className="rounded-lg border border-[var(--pf-border-default)] p-3">
                      <dt className="text-sm text-[var(--pf-text-secondary)]">{t(`execution.${key}`)}</dt>
                      <dd className="mt-1 font-medium tabular-nums">{formatMoneyString(amount, payables.currency, locale)}</dd>
                    </div>
                  ))}
                </>
              ) : null}
            </dl>
          </section>
        ) : null}
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
    </WithClientMessages>
  );
}

export default function ProjectExecutionDashboardPage(
  props: Omit<Parameters<typeof ProjectExecutionDashboardScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectExecutionDashboardScreen {...props} />;
}
