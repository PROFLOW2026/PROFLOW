import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ReceivablesAgingPanel } from '@/modules/billing/ui/receivables-aging-panel';
import { Link } from '@/shared/i18n/navigation';
import type { OrganizationReportsAnalytics } from '../application/get-organization-reports-analytics';
import type { CountReportMetric, MoneyReportMetric, ReportMetricKind } from '../domain/report-metric';
import { CashFlowView } from './cash-flow-view';
import { CountReportMetricTile, MoneyReportMetricTile } from './report-metric-tile';

function natureKey(kind: ReportMetricKind | 'operational'): string {
  if (kind === 'commercial') return 'commercial';
  if (kind === 'estimate') return 'estimate';
  if (kind === 'operational') return 'operational';
  return kind;
}

export async function ReportsAnalyticsView({
  analytics,
}: {
  readonly analytics: OrganizationReportsAnalytics;
}) {
  const t = await getTranslations('dashboard.reports');
  const tFinancial = await getTranslations('financial');
  const { rollup, cashFlow } = analytics;

  const moneyCopy = (metric: MoneyReportMetric, label: string) => ({
    label,
    natureLabel: t(`natures.${natureKey(metric.kind)}` as 'natures.actual'),
    inclusionLabels: metric.inclusions.map((key) =>
      t(`inclusions.${key}` as 'inclusions.primaryContractsBaseCurrency'),
    ),
    exclusionLabels: metric.exclusions.map((key) =>
      t(`exclusions.${key}` as 'exclusions.foreignCurrencyProjects'),
    ),
  });

  const countCopy = (metric: CountReportMetric, label: string) => ({
    label,
    natureLabel: t(`natures.${natureKey(metric.kind)}` as 'natures.operational'),
    inclusionLabels: metric.inclusions.map((key) =>
      t(`inclusions.${key}` as 'inclusions.plannedMilestones'),
    ),
    exclusionLabels: metric.exclusions.map((key) =>
      t(`exclusions.${key}` as 'exclusions.notifications'),
    ),
  });

  return (
    <div className="flex min-w-0 w-full max-w-full flex-col gap-8 text-start">
      <ul className="flex min-w-0 flex-col gap-1 text-xs text-[var(--pf-text-secondary)]">
        {analytics.disclosures.map((key) => (
          <li key={key} className="break-words">
            {t(`disclosures.${key}` as 'disclosures.baseCurrencyOnly')}
          </li>
        ))}
        {rollup.excludedForeignCurrencyCount > 0 ? (
          <li className="break-words">
            {t('excludedForeign', { count: rollup.excludedForeignCurrencyCount })}
          </li>
        ) : null}
        {rollup.truncatedActiveProjectCount > 0 ? (
          <li className="break-words">
            {t('truncatedRollup', { count: rollup.truncatedActiveProjectCount })}
          </li>
        ) : null}
      </ul>

      {analytics.commercial ? (
        <section className="flex min-w-0 flex-col gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t('sections.commercial')}</h2>
            <p className="break-words text-xs text-[var(--pf-text-secondary)]">
              {t('sections.commercialHint')}
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <MoneyReportMetricTile
              metric={analytics.commercial.original}
              copy={moneyCopy(analytics.commercial.original, tFinancial('originalContractValue'))}
            />
            <MoneyReportMetricTile
              metric={analytics.commercial.approvedAdditions}
              copy={moneyCopy(analytics.commercial.approvedAdditions, tFinancial('approvedAdditions'))}
            />
            <MoneyReportMetricTile
              metric={analytics.commercial.approvedReductions}
              copy={moneyCopy(
                analytics.commercial.approvedReductions,
                tFinancial('approvedReductions'),
              )}
            />
            <MoneyReportMetricTile
              metric={analytics.commercial.current}
              copy={moneyCopy(analytics.commercial.current, tFinancial('currentContractValue'))}
            />
            <MoneyReportMetricTile
              metric={analytics.commercial.pending}
              copy={moneyCopy(analytics.commercial.pending, tFinancial('pendingChanges'))}
            />
          </div>
        </section>
      ) : null}

      {analytics.cash || analytics.showArAging || cashFlow ? (
        <section className="flex min-w-0 flex-col gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t('sections.cash')}</h2>
            <p className="break-words text-xs text-[var(--pf-text-secondary)]">
              {t('sections.cashHint')}
            </p>
          </div>
          {analytics.cash ? (
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
              <MoneyReportMetricTile
                metric={analytics.cash.invoiced}
                copy={moneyCopy(analytics.cash.invoiced, tFinancial('invoiced'))}
              />
              <MoneyReportMetricTile
                metric={analytics.cash.paid}
                copy={moneyCopy(analytics.cash.paid, tFinancial('paid'))}
              />
              <MoneyReportMetricTile
                metric={analytics.cash.outstanding}
                copy={moneyCopy(analytics.cash.outstanding, tFinancial('outstanding'))}
                colorizeNegative
              />
            </div>
          ) : null}
          {analytics.showArAging && analytics.arAging ? (
            <div className="min-w-0 max-w-full">
              <ReceivablesAgingPanel aging={analytics.arAging} />
            </div>
          ) : null}
          {cashFlow ? (
            <div className="min-w-0 max-w-full">
              <CashFlowView
                cashFlow={cashFlow}
                copy={{
                  title: t('cashFlow.title'),
                  actualTitle: t('cashFlow.actualTitle'),
                  actualHint: t('cashFlow.actualHint'),
                  forecastTitle: t('cashFlow.forecastTitle'),
                  forecastHint: t('cashFlow.forecastHint'),
                  outgoingTitle: t('cashFlow.outgoingTitle'),
                  outgoingDisclosure: t('cashFlow.outgoingDisclosure'),
                  outgoingAvailableHint: t('cashFlow.outgoingAvailableHint'),
                  undatedNote: t('cashFlow.undatedNote'),
                  bucketLabel: (key) => t(`cashFlow.buckets.${key}`),
                  paymentCount: (count) => t('cashFlow.paymentCount', { count }),
                  billCount: (count) => t('cashFlow.billCount', { count }),
                }}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {analytics.cost ? (
        <section className="flex min-w-0 flex-col gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t('sections.cost')}</h2>
            <p className="break-words text-xs text-[var(--pf-text-secondary)]">
              {t('sections.costHint')}
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <MoneyReportMetricTile
              metric={analytics.cost.actual}
              copy={moneyCopy(analytics.cost.actual, tFinancial('actualCostToDate'))}
            />
            <MoneyReportMetricTile
              metric={analytics.cost.labor}
              copy={moneyCopy(analytics.cost.labor, tFinancial('laborActual'))}
            />
            <MoneyReportMetricTile
              metric={analytics.cost.vendors}
              copy={moneyCopy(analytics.cost.vendors, tFinancial('vendorActual'))}
            />
            <MoneyReportMetricTile
              metric={analytics.cost.overhead}
              copy={moneyCopy(analytics.cost.overhead, tFinancial('overheadActual'))}
            />
            <MoneyReportMetricTile
              metric={analytics.cost.committed}
              copy={moneyCopy(analytics.cost.committed, tFinancial('committedOpen'))}
            />
            <MoneyReportMetricTile
              metric={analytics.cost.openAp}
              copy={moneyCopy(analytics.cost.openAp, tFinancial('openApPayable'))}
            />
            <MoneyReportMetricTile
              metric={analytics.cost.estimatedFinal}
              copy={moneyCopy(analytics.cost.estimatedFinal, tFinancial('estimatedFinalCost'))}
            />
          </div>
          <p className="text-xs text-[var(--pf-text-secondary)]">{tFinancial('committedVsActual')}</p>
        </section>
      ) : null}

      {analytics.profitability ? (
        <section className="flex min-w-0 flex-col gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t('sections.profitability')}</h2>
            <p className="break-words text-xs text-[var(--pf-text-secondary)]">
              {t('sections.profitabilityHint')}
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MoneyReportMetricTile
              metric={analytics.profitability.estimatedProfit}
              copy={moneyCopy(
                analytics.profitability.estimatedProfit,
                tFinancial('estimatedProfitBasedOnEnteredData'),
              )}
              colorizeNegative
            />
            {rollup.ops.profitableCount != null ? (
              <div className="min-w-0 max-w-full rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 text-start">
                <p className="break-words text-xs text-[var(--pf-text-secondary)]">
                  {t('profitability.profitable')}
                </p>
                <p className="mt-1 text-base font-semibold pf-numeric" dir="ltr">
                  {rollup.ops.profitableCount}
                </p>
              </div>
            ) : null}
            {rollup.ops.lossMakingCount != null ? (
              <div className="min-w-0 max-w-full rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 text-start">
                <p className="break-words text-xs text-[var(--pf-text-secondary)]">
                  {t('profitability.lossMaking')}
                </p>
                <p className="mt-1 text-base font-semibold pf-numeric" dir="ltr">
                  {rollup.ops.lossMakingCount}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="flex min-w-0 flex-col gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('sections.operations')}</h2>
          <p className="break-words text-xs text-[var(--pf-text-secondary)]">
            {t('sections.operationsHint')}
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div className="min-w-0 max-w-full rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 text-start">
            <p className="break-words text-xs text-[var(--pf-text-secondary)]">
              {t('operations.activeProjects')}
            </p>
            <p className="mt-1 text-base font-semibold pf-numeric" dir="ltr">
              {analytics.operations.activeProjectCount}
            </p>
          </div>
          {analytics.operations.progressAveragePercent != null ? (
            <div className="min-w-0 max-w-full rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 text-start">
              <p className="break-words text-xs text-[var(--pf-text-secondary)]">
                {t('operations.avgProgress')}
              </p>
              <p className="mt-1 text-base font-semibold pf-numeric" dir="ltr">
                {analytics.operations.progressAveragePercent}%
              </p>
            </div>
          ) : null}
          {analytics.operations.milestones
            ? (
                <>
                  <CountReportMetricTile
                    metric={analytics.operations.milestones.planned}
                    copy={countCopy(
                      analytics.operations.milestones.planned,
                      t('operations.milestonesPlanned'),
                    )}
                  />
                  <CountReportMetricTile
                    metric={analytics.operations.milestones.overdue}
                    copy={countCopy(
                      analytics.operations.milestones.overdue,
                      t('operations.milestonesOverdue'),
                    )}
                  />
                  <CountReportMetricTile
                    metric={analytics.operations.milestones.missed}
                    copy={countCopy(
                      analytics.operations.milestones.missed,
                      t('operations.milestonesMissed'),
                    )}
                  />
                </>
              )
            : null}
          {analytics.operations.procurement ? (
            <>
              <CountReportMetricTile
                metric={analytics.operations.procurement.openOrders}
                copy={countCopy(
                  analytics.operations.procurement.openOrders,
                  t('operations.poOpen'),
                )}
              />
              <CountReportMetricTile
                metric={analytics.operations.procurement.issuedOrders}
                copy={countCopy(
                  analytics.operations.procurement.issuedOrders,
                  t('operations.poIssued'),
                )}
              />
            </>
          ) : null}
          {analytics.operations.fieldOpenItems ? (
            <CountReportMetricTile
              metric={analytics.operations.fieldOpenItems}
              copy={countCopy(
                analytics.operations.fieldOpenItems,
                t('operations.openPunch'),
              )}
            />
          ) : null}
          {analytics.operations.compliance ? (
            <>
              <CountReportMetricTile
                metric={analytics.operations.compliance.expired}
                copy={countCopy(
                  analytics.operations.compliance.expired,
                  t('operations.complianceExpired'),
                )}
              />
              <CountReportMetricTile
                metric={analytics.operations.compliance.expiringSoon}
                copy={countCopy(
                  analytics.operations.compliance.expiringSoon,
                  t('operations.complianceExpiring'),
                )}
              />
              <CountReportMetricTile
                metric={analytics.operations.compliance.missingEvidence}
                copy={countCopy(
                  analytics.operations.compliance.missingEvidence,
                  t('operations.complianceMissing'),
                )}
              />
            </>
          ) : null}
          {analytics.operations.assets ? (
            <>
              <CountReportMetricTile
                metric={analytics.operations.assets.active}
                copy={countCopy(analytics.operations.assets.active, t('operations.assetsActive'))}
              />
              <CountReportMetricTile
                metric={analytics.operations.assets.assignedToProjects}
                copy={countCopy(
                  analytics.operations.assets.assignedToProjects,
                  t('operations.assetsAssigned'),
                )}
              />
              <CountReportMetricTile
                metric={analytics.operations.assets.inMaintenance}
                copy={countCopy(
                  analytics.operations.assets.inMaintenance,
                  t('operations.assetsMaintenance'),
                )}
              />
              {analytics.operations.assets.capitalExpenseActual ? (
                <MoneyReportMetricTile
                  metric={analytics.operations.assets.capitalExpenseActual}
                  copy={moneyCopy(
                    analytics.operations.assets.capitalExpenseActual,
                    t('operations.assetCapitalCost'),
                  )}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('sections.comparison')}</h2>
          <p className="break-words text-xs text-[var(--pf-text-secondary)]">
            {t('sections.comparisonHint')}
          </p>
        </div>
        <ResponsiveTable
          items={rollup.rows}
          getRowKey={(row) => row.projectId}
          desktop={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.project')}</TableHead>
                  {rollup.canReadCommercial ? (
                    <TableHead>{tFinancial('currentContractValue')}</TableHead>
                  ) : null}
                  {rollup.canReadBilling ? (
                    <TableHead>{tFinancial('outstanding')}</TableHead>
                  ) : null}
                  <TableHead>{tFinancial('actualCostToDate')}</TableHead>
                  <TableHead>{tFinancial('committedOpen')}</TableHead>
                  {rollup.canReadProfit ? (
                    <TableHead>{tFinancial('estimatedProfit')}</TableHead>
                  ) : null}
                  <TableHead>{t('columns.progress')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rollup.rows.map((row) => (
                  <TableRow key={row.projectId}>
                    <TableCell>
                      <Link href={`/projects/${row.projectId}`} className="hover:underline">
                        {row.name}
                      </Link>
                    </TableCell>
                    {rollup.canReadCommercial ? (
                      <TableCell>
                        {row.currentContract ? <MoneyText value={row.currentContract} /> : '—'}
                      </TableCell>
                    ) : null}
                    {rollup.canReadBilling ? (
                      <TableCell>
                        {row.outstanding ? (
                          <MoneyText value={row.outstanding} colorizeNegative />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      {row.actualCost ? <MoneyText value={row.actualCost} /> : '—'}
                    </TableCell>
                    <TableCell>
                      {row.committedOpen ? <MoneyText value={row.committedOpen} /> : '—'}
                    </TableCell>
                    {rollup.canReadProfit ? (
                      <TableCell>
                        {row.estimatedProfit ? (
                          <MoneyText value={row.estimatedProfit} colorizeNegative />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    ) : null}
                    <TableCell>{row.progressPercent ? `${row.progressPercent}%` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
          renderMobileCard={(row) => (
            <Link
              href={`/projects/${row.projectId}`}
              className="block min-h-11 min-w-0 max-w-full rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 text-start"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 break-words font-semibold">{row.name}</span>
                <span className="shrink-0 text-sm text-[var(--pf-text-secondary)]">
                  {row.progressPercent ? `${row.progressPercent}%` : '—'}
                </span>
              </div>
              <dl className="mt-3 grid min-w-0 grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                {rollup.canReadCommercial ? (
                  <div className="min-w-0">
                    <dt className="break-words text-[var(--pf-text-secondary)]">
                      {tFinancial('currentContractValue')}
                    </dt>
                    <dd className="min-w-0 max-w-full overflow-x-auto">
                      {row.currentContract ? <MoneyText value={row.currentContract} /> : '—'}
                    </dd>
                  </div>
                ) : null}
                {rollup.canReadBilling ? (
                  <div className="min-w-0">
                    <dt className="break-words text-[var(--pf-text-secondary)]">
                      {tFinancial('outstanding')}
                    </dt>
                    <dd className="min-w-0 max-w-full overflow-x-auto">
                      {row.outstanding ? (
                        <MoneyText value={row.outstanding} colorizeNegative />
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                ) : null}
                <div className="min-w-0">
                  <dt className="break-words text-[var(--pf-text-secondary)]">
                    {tFinancial('actualCostToDate')}
                  </dt>
                  <dd className="min-w-0 max-w-full overflow-x-auto">
                    {row.actualCost ? <MoneyText value={row.actualCost} /> : '—'}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="break-words text-[var(--pf-text-secondary)]">
                    {tFinancial('committedOpen')}
                  </dt>
                  <dd className="min-w-0 max-w-full overflow-x-auto">
                    {row.committedOpen ? <MoneyText value={row.committedOpen} /> : '—'}
                  </dd>
                </div>
                {rollup.canReadProfit ? (
                  <div className="min-w-0">
                    <dt className="break-words text-[var(--pf-text-secondary)]">
                      {tFinancial('estimatedProfit')}
                    </dt>
                    <dd className="min-w-0 max-w-full overflow-x-auto">
                      {row.estimatedProfit ? (
                        <MoneyText value={row.estimatedProfit} colorizeNegative />
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </Link>
          )}
        />
      </section>
    </div>
  );
}
