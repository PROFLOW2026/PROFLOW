import { getLocale, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { loadProjectCostControl } from '@/modules/project-workspace/application/load-cost-control';
import type { CostControlTradeRollup } from '@/modules/project-workspace/domain/cost-control-rows';
import { CostControlFigure } from '@/modules/project-workspace/ui/cost-control-figure';
import type { MetricMoney } from '@/modules/project-workspace/domain/metric-value';
import type { AgreementLifecycleStatus } from '@/modules/subcontracts';
import { AgreementStatusBadge } from '@/modules/subcontracts/ui/status';
import { withOrgContext } from '@/shared/auth/session';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import { LineChart } from 'lucide-react';

export async function ProjectCostControlScreen({
  surfaceRoot: _surfaceRoot,
  params,
}: {
  surfaceRoot?: string;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireProjectCapabilityPage(
    projectId,
    [PROJECT_CAPABILITIES.FINANCIAL_VIEW, PROJECT_CAPABILITIES.PROJECT_BUDGET_VIEW],
    { mode: 'any' },
  );
  const [t, tSub, locale, data] = await Promise.all([
    getTranslations('projectWorkspace'),
    getTranslations('subcontracts'),
    getLocale(),
    withOrgContext((context) => loadProjectCostControl(context, projectId)),
  ]);

  const unavailable = t('costControl.figureUnavailable');
  const tradeFigures = (rollup: CostControlTradeRollup) =>
    [
      ['originalBudget', t('costControl.originalBudget'), rollup.originalBudget],
      ['approvedBudget', t('costControl.approvedBudget'), rollup.approvedBudget],
      ['committed', t('costControl.committed'), rollup.committed],
      ['approvedChanges', t('costControl.approvedChanges'), rollup.approvedChanges],
      ['submittedClaims', t('costControl.submittedClaims'), rollup.submittedClaims],
      ['certified', t('costControl.certified'), rollup.certified],
      ['apActual', t('costControl.apActual'), rollup.apActual],
      ['paid', t('costControl.paid'), rollup.paid],
      ['retentionHeld', t('costControl.retentionHeld'), rollup.retentionHeld],
      ['forecastRemaining', t('costControl.forecastRemaining'), rollup.forecastRemaining],
      ['forecastFinal', t('costControl.forecastFinal'), rollup.forecastFinal],
    ] as const;

  return (
    <WithAppClientMessages extra={['projectWorkspace', 'subcontracts']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('execution.costControl')} description={t('costControl.pageDescription')} />

        {data.rows.length === 0 ? (
          <EmptyState icon={LineChart} title={t('costControl.emptyTitle')} description={t('costControl.emptyDescription')} />
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-[var(--pf-text-primary)]">{t('costControl.tradeRollupTitle')}</h2>
              <ul className="flex flex-col gap-4">
                {data.tradeRollups.map((rollup) => (
                  <li key={rollup.tradeKey || 'unassigned'}>
                    <Card>
                      <CardHeader className="gap-2 pb-2">
                        <CardTitle className="text-base">{rollup.trade ?? t('costControl.tradeUnassigned')}</CardTitle>
                        {rollup.workPackages.length > 0 ? (
                          <p className="text-sm text-[var(--pf-text-secondary)]">
                            {rollup.workPackages.map((pkg) => pkg.name).join(' · ')}
                          </p>
                        ) : null}
                      </CardHeader>
                      <CostControlFigureGrid
                        figures={tradeFigures(rollup).map(([key, label, metric]) => ({ key, label, metric }))}
                        unavailableLabel={unavailable}
                        locale={locale}
                      />
                    </Card>
                  </li>
                ))}
              </ul>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-[var(--pf-text-primary)]">{t('costControl.agreementsTitle')}</h2>
              <ul className="flex flex-col gap-4">
                {data.rows.map((row) => (
                  <li key={row.agreementId}>
                    <Card>
                      <CardHeader className="gap-2 pb-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <CardTitle className="text-base">{row.title}</CardTitle>
                          <AgreementStatusBadge
                            status={row.status as AgreementLifecycleStatus}
                            label={tSub(`agreementStatus.${row.status}`)}
                          />
                        </div>
                        <p className="text-sm text-[var(--pf-text-secondary)]">
                          {row.vendorName ?? t('contractors.unknownVendor')}
                          {row.trade ? ` · ${row.trade}` : ''}
                        </p>
                      </CardHeader>
                      <CostControlFigureGrid
                        figures={[
                          { key: 'committed', label: t('costControl.committed'), metric: row.committed },
                          { key: 'approvedChanges', label: t('costControl.approvedChanges'), metric: row.approvedChanges },
                          { key: 'submittedClaims', label: t('costControl.submittedClaims'), metric: row.submittedClaims },
                          { key: 'certified', label: t('costControl.certified'), metric: row.certified },
                          { key: 'apActual', label: t('costControl.apActual'), metric: row.apActual },
                          { key: 'paid', label: t('costControl.paid'), metric: row.paid },
                          { key: 'retentionHeld', label: t('costControl.retentionHeld'), metric: row.retentionHeld },
                        ]}
                        unavailableLabel={unavailable}
                        locale={locale}
                      />
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </WithAppClientMessages>
  );
}

function CostControlFigureGrid({
  figures,
  unavailableLabel,
  locale,
}: {
  readonly figures: readonly { readonly key: string; readonly label: string; readonly metric: MetricMoney }[];
  readonly unavailableLabel: string;
  readonly locale: string;
}) {
  return (
    <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {figures.map((figure) => (
        <CostControlFigure
          key={figure.key}
          label={figure.label}
          metric={figure.metric}
          unavailableLabel={unavailableLabel}
          locale={locale}
        />
      ))}
    </CardContent>
  );
}

export default function ProjectCostControlPage(
  props: Omit<Parameters<typeof ProjectCostControlScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectCostControlScreen {...props} />;
}
