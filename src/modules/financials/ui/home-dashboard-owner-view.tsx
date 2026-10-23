import type React from 'react';
import { Plus, Receipt } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { BillingNetPrimaryDisplay } from '@/components/patterns/billing-net-primary-display';
import { MoneyText } from '@/components/patterns/money-text';
import { formatPercentDisplay } from '@/shared/number/display';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PrefetchOnIntentLink } from '@/components/ui/prefetch-on-intent-link';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import { cn } from '@/shared/ui/cn';
import { compareMoney, type MoneyValue } from '@/shared/money';
import { lifetimeCashDifference } from '../domain/lifetime-cash-difference';
import { ProjectStatusBadge } from '@/app/[locale]/(app)/projects/project-status-badge';
import type { ProjectStatus } from '@/modules/projects';
import type { HomeDashboardData } from '../application/get-home-dashboard';
import { partitionDashboardCompletenessItems } from '../domain/dashboard-missing-data';
import {
  buildActualCostDetail,
  buildApOutstandingDetail,
  buildBillingPaidDetail,
  buildBusinessCashOutstandingDetail,
  buildBusinessCashPaidDetail,
  buildCashDifferenceDetail,
  buildCompanyActualDetail,
  buildContractValueDetail,
  buildCurrentProfitDetail,
  buildCustomerReceivableDetail,
  buildProfitabilityRateDetail,
  buildProjectPaidCashDetail,
} from '../domain/dashboard-kpi-detail-builders';
import { mergeDashboardDetailNotes, type DashboardKpiDetailContent } from '../domain/dashboard-kpi-detail';
import { DashboardMissingDataTrigger } from './dashboard-missing-data-trigger';
import { HomeLaborReconciliation, HomePendingTimeAlert } from './home-labor-alerts';
import { mapDashboardMissingDataToView } from './map-dashboard-missing-data-view';
import { DashboardQuickAccessSection } from './dashboard-quick-access-section';
import { DashboardAttentionCards } from './dashboard-attention-cards';
import { DashboardContractSummaryRow } from './dashboard-contract-summary-row';
import { DashboardRecentProjectsSection } from './dashboard-recent-projects-section';
import { DashboardKpiDetailTrigger } from './dashboard-kpi-detail-trigger';
import { HomeDashboardCashForecast } from './home-dashboard-cash-forecast';
import { HomeDashboardMonthlyLedger } from './home-dashboard-monthly-ledger';
import { HomeDashboardRestoredSections } from './home-dashboard-restored-sections';
import {
  mapDashboardKpiDetailCopy,
  mapDashboardKpiDetailTriggerCopy,
} from './dashboard-kpi-detail-copy';
import {
  isExperienceUiVisible,
  type ExperienceUiToggleId,
} from '@/modules/tenancy/domain/experience-ui-registry';

function showDashboardUi(data: HomeDashboardData, id: ExperienceUiToggleId): boolean {
  return isExperienceUiVisible(id, data.experienceUiContext);
}

interface HomeDashboardOwnerViewProps {
  readonly data: HomeDashboardData;
}

function grossWhenVatExists(
  net: MoneyValue | null | undefined,
  gross: MoneyValue | null | undefined,
): MoneyValue | undefined {
  if (!net || !gross || net.currency !== gross.currency) return undefined;
  return compareMoney(net, gross) === 0 ? undefined : gross;
}

function KpiTile({
  title,
  money,
  grossMoney,
  grossLabel,
  percent,
  hint,
  footer,
  detail,
  detailCopy,
  unavailable,
  unavailableLabel,
  colorizeResult = false,
}: {
  title: string;
  money?: MoneyValue;
  grossMoney?: MoneyValue;
  grossLabel?: string;
  percent?: string | null;
  hint?: string;
  footer?: React.ReactNode;
  detail?: DashboardKpiDetailContent;
  detailCopy?: ReturnType<typeof mapDashboardKpiDetailTriggerCopy>;
  unavailable?: boolean;
  unavailableLabel?: string;
  colorizeResult?: boolean;
}) {
  const percentTone =
    colorizeResult && percent
      ? Number(percent) > 0
        ? 'text-[var(--pf-status-success-fg)]'
        : Number(percent) < 0
          ? 'text-[var(--pf-status-danger-fg)]'
          : undefined
      : undefined;
  const resolvedDetail = mergeDashboardDetailNotes(detail, title, [hint]);
  return (
    <Card className="min-w-0 max-w-full">
      <CardContent className="flex min-w-0 flex-col gap-1 p-4">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className="text-xs text-[var(--pf-text-muted)]">{title}</p>
          {resolvedDetail && detailCopy ? (
            <DashboardKpiDetailTrigger detail={resolvedDetail} copy={detailCopy} />
          ) : null}
        </div>
        {unavailable ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{unavailableLabel}</p>
        ) : percent != null ? (
          <p className="text-lg font-semibold">
            <span dir="ltr" className={`pf-numeric inline-block max-w-full ${percentTone ?? ''}`}>
              {formatPercentDisplay(percent)}
            </span>
          </p>
        ) : money && grossMoney && grossLabel ? (
          <BillingNetPrimaryDisplay
            netAmount={money}
            grossAmount={grossMoney}
            grossLabel={grossLabel}
            netClassName="text-lg"
            colorizeResult={colorizeResult}
          />
        ) : money ? (
          <p className="min-w-0 max-w-full overflow-x-auto text-lg font-semibold">
            <MoneyText value={money} colorizeResult={colorizeResult} />
          </p>
        ) : (
          <p className="text-sm text-[var(--pf-text-secondary)]">—</p>
        )}
        {footer}
      </CardContent>
    </Card>
  );
}

export async function HomeDashboardOwnerView({ data }: HomeDashboardOwnerViewProps) {
  const [t, tFinancial, tNav, tStatus, locale] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('financial'),
    getTranslations('nav'),
    getTranslations('status.project'),
    getLocale(),
  ]);

  const detailCopy = mapDashboardKpiDetailCopy(t);
  const triggerCopy = mapDashboardKpiDetailTriggerCopy(t);
  const showContractHeadline = !data.contractSummary;

  const contractUnavailable = data.kpiAvailability?.contractValue === 'unavailable';
  const costUnavailable = data.kpiAvailability?.actualCost === 'unavailable';
  const profitUnavailable = data.kpiAvailability?.actualMargin === 'unavailable';

  const actualCostMoney =
    data.totalActualCost ?? data.forecast?.totalActualProjectCost ?? undefined;
  const kpiBreakdown = data.kpiBreakdown;
  const actualCostDetail =
    actualCostMoney && !costUnavailable
      ? buildActualCostDetail(actualCostMoney, t('ownerHeadline.projectRecognizedCost'), detailCopy, kpiBreakdown)
      : undefined;
  const currentProfitDetail =
    data.actualProfitTotal && !profitUnavailable
      ? buildCurrentProfitDetail(
          data.actualProfitTotal,
          data.totalContractValue,
          actualCostMoney ?? null,
          t('ownerHeadline.actualProfit'),
          detailCopy,
        )
      : undefined;
  const apDetail = data.apOutstanding
    ? buildApOutstandingDetail(
        data.apOutstanding,
        tFinancial('apOutstanding'),
        detailCopy,
        t('businessSummary.viewApOutstanding'),
      )
    : undefined;

  const completenessPartitions = partitionDashboardCompletenessItems(data.missingDataItems);
  const translateDashboard = (key: string, values?: Record<string, string | number>) =>
    t(key, values as Record<string, string | number> | undefined);
  const missingDataItemsView = mapDashboardMissingDataToView(
    completenessPartitions.missing,
    translateDashboard,
    { locale },
  );
  const attentionItemsView = mapDashboardMissingDataToView(
    completenessPartitions.attention,
    translateDashboard,
    { locale },
  );
  const hasCompletenessTrigger =
    missingDataItemsView.length > 0 || attentionItemsView.length > 0;

  const kpiColumnClass = showContractHeadline
    ? 'grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5'
    : 'grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4';

  const paidNet =
    data.businessCashPosition?.actualPaidNet ?? data.businessCashPosition?.actualPaid ?? null;
  const paidGross =
    data.businessCashPosition?.actualPaid ?? data.businessCashPosition?.actualPaidNet ?? null;
  const cashDifference =
    data.billing?.netPaid && paidNet && paidGross
      ? lifetimeCashDifference({
          receivedNet: data.billing.netPaid,
          receivedGross: data.billing.paid,
          paidNet,
          paidGross,
        })
      : null;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4">
      {data.pendingTime && showDashboardUi(data, 'common.pendingTime') ? (
        <HomePendingTimeAlert pendingTime={data.pendingTime} canApproveTime={data.canApproveTime} />
      ) : null}
      {data.laborReconciliation && showDashboardUi(data, 'common.laborReconciliation') ? (
        <HomeLaborReconciliation laborReconciliation={data.laborReconciliation} />
      ) : null}
      {showDashboardUi(data, 'shortcuts.dashboardQuickAccess') ? (
        <DashboardQuickAccessSection shortcuts={data.quickAccessShortcuts} />
      ) : null}
      {showDashboardUi(data, 'common.attention') ? (
        <DashboardAttentionCards attention={data.attention} />
      ) : null}
      {hasCompletenessTrigger ? (
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <DashboardMissingDataTrigger
            missingItems={missingDataItemsView}
            attentionItems={attentionItemsView}
            copy={{
              missingButtonOne: t('missingData.missingButtonOne'),
              missingButtonMany: t.raw('missingData.missingButtonMany') as string,
              attentionButtonOne: t('missingData.attentionButtonOne'),
              attentionButtonMany: t.raw('missingData.attentionButtonMany') as string,
              modalTitle: t('missingData.modalTitle'),
              modalDescription: t('missingData.modalDescription'),
              sectionMissing: t('missingData.sectionMissing'),
              sectionAttention: t('missingData.sectionAttention'),
              missingItemLabel: t('missingData.missingItemLabel'),
              attentionItemLabel: t('missingData.attentionItemLabel'),
            }}
          />
        </div>
      ) : null}

      {data.billing?.netPaid || data.businessCashPosition?.actualPaidNet || data.businessCashPosition?.actualPaid ? (
        <section
          className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
          data-pf-dashboard-cash-picture=""
        >
          {data.billing?.netPaid ? (
            <div data-pf-dashboard-metric="collections-lifetime">
              <KpiTile
                title={t('ownerHeadline.cashReceived')}
                money={data.billing.netPaid}
                grossMoney={grossWhenVatExists(data.billing.netPaid, data.billing.paid)}
                grossLabel={tFinancial('kpis.includingVat')}
                hint={t('ownerHeadline.cashReceivedHint')}
                detail={buildBillingPaidDetail(
                  data.billing.netPaid,
                  data.billing.paid,
                  t('ownerHeadline.cashReceived'),
                  detailCopy,
                )}
                detailCopy={triggerCopy}
              />
            </div>
          ) : null}
          {data.businessCashPosition?.actualPaidNet || data.businessCashPosition?.actualPaid ? (
            <div data-pf-dashboard-metric="cash-paid-lifetime">
              <KpiTile
                title={t('ownerHeadline.cashPaid')}
                money={
                  data.businessCashPosition.actualPaidNet ??
                  data.businessCashPosition.actualPaid ??
                  undefined
                }
                grossMoney={grossWhenVatExists(
                  data.businessCashPosition.actualPaidNet,
                  data.businessCashPosition.actualPaid,
                )}
                grossLabel={tFinancial('kpis.includingVat')}
                hint={t('ownerHeadline.cashPaidHint')}
                detail={buildBusinessCashPaidDetail(
                  data.businessCashPosition,
                  t('ownerHeadline.cashPaid'),
                  detailCopy,
                )}
                detailCopy={triggerCopy}
              />
            </div>
          ) : null}
          {cashDifference && paidNet && paidGross ? (
            <div data-pf-dashboard-metric="cash-difference-lifetime">
              <KpiTile
                title={t('ownerHeadline.cashDifference')}
                money={cashDifference.net}
                grossMoney={grossWhenVatExists(cashDifference.net, cashDifference.gross)}
                grossLabel={tFinancial('kpis.includingVat')}
                hint={t('ownerHeadline.cashDifferenceHint')}
                colorizeResult
                detail={buildCashDifferenceDetail(
                  data.billing!.netPaid,
                  data.billing!.paid,
                  paidNet,
                  paidGross,
                  t('ownerHeadline.cashDifference'),
                  detailCopy,
                )}
                detailCopy={triggerCopy}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {data.contractSummary && showDashboardUi(data, 'owner.contractSummary') ? (
        <DashboardContractSummaryRow
          summary={data.contractSummary}
          netInvoiced={data.contractNetInvoiced}
        />
      ) : null}

      {showDashboardUi(data, 'owner.kpiRow') ? (
      <section className={kpiColumnClass}>
        {showContractHeadline ? (
          <KpiTile
            title={t('ownerHeadline.workValue')}
            money={data.totalContractValue ?? undefined}
            unavailable={contractUnavailable}
            unavailableLabel={t('missingData.kpiUnavailable')}
            detail={
              data.totalContractValue && !contractUnavailable
                ? buildContractValueDetail(
                    data.totalContractValue,
                    t('ownerHeadline.workValue'),
                    detailCopy,
                  )
                : undefined
            }
            detailCopy={triggerCopy}
          />
        ) : null}
        <KpiTile
          title={t('ownerHeadline.projectRecognizedCost')}
          money={actualCostMoney}
          unavailable={costUnavailable}
          unavailableLabel={t('missingData.kpiUnavailable')}
          hint={costUnavailable ? undefined : tFinancial('basis.actualNotCash')}
          detail={actualCostDetail}
          detailCopy={triggerCopy}
        />
        {data.projectPaidCash ? (
          <KpiTile
            title={t('ownerHeadline.projectPaidCash')}
            money={data.projectPaidCash.net}
            grossMoney={grossWhenVatExists(data.projectPaidCash.net, data.projectPaidCash.gross)}
            grossLabel={tFinancial('kpis.includingVat')}
            hint={t('ownerHeadline.projectPaidCashHint')}
            detail={buildProjectPaidCashDetail(
              data.projectPaidCash,
              t('ownerHeadline.projectPaidCash'),
              {
                whatIs: t('kpiDetail.projectPaidWhat'),
                formula: t('kpiDetail.projectPaidFormula'),
                suppliers: t('kpiDetail.labelProjectSuppliers'),
                contractors: t('kpiDetail.labelProjectContractors'),
                other: t('kpiDetail.labelProjectOtherPaid'),
                labor: t('kpiDetail.labelProjectLaborPaid'),
                includingVat: tFinancial('kpis.includingVat'),
              },
            )}
            detailCopy={triggerCopy}
          />
        ) : null}
        <KpiTile
          title={t('ownerHeadline.actualProfit')}
          money={data.actualProfitTotal ?? undefined}
          unavailable={profitUnavailable}
          unavailableLabel={t('missingData.kpiUnavailable')}
          hint={profitUnavailable ? undefined : t('ownerHeadline.actualProfitHint')}
          colorizeResult
          detail={currentProfitDetail}
          detailCopy={triggerCopy}
        />
        <KpiTile
          title={t('ownerHeadline.profitability')}
          percent={data.profitabilityPercent}
          colorizeResult
          unavailable={profitUnavailable && !data.profitabilityPercent}
          unavailableLabel={t('missingData.kpiUnavailable')}
          detail={
            data.profitabilityPercent && !profitUnavailable
              ? buildProfitabilityRateDetail(
                  data.profitabilityPercent,
                  data.actualProfitTotal,
                  data.totalContractValue,
                  t('ownerHeadline.profitability'),
                  detailCopy,
                )
              : undefined
          }
          detailCopy={triggerCopy}
        />
      </section>
      ) : null}

      {data.forecast?.companyActual != null || data.businessCashPosition || data.billing ? (
        <section className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.forecast?.companyActual != null ? (
            <KpiTile
              title={t('ownerHeadline.companyRecognizedCosts')}
              money={data.forecast.companyActual}
              hint={tFinancial('companyActualDashboardHint')}
              detail={
                kpiBreakdown
                  ? buildCompanyActualDetail(
                      data.forecast.companyActual,
                      kpiBreakdown,
                      t('ownerHeadline.companyRecognizedCosts'),
                      detailCopy,
                    )
                  : undefined
              }
              detailCopy={triggerCopy}
            />
          ) : null}
          {data.businessCashPosition?.outstandingPayableNet ||
          data.businessCashPosition?.outstandingPayable ? (
            <KpiTile
              title={t('ownerHeadline.payableRemaining')}
              money={
                data.businessCashPosition.outstandingPayableNet ??
                data.businessCashPosition.outstandingPayable ??
                undefined
              }
              grossMoney={grossWhenVatExists(
                data.businessCashPosition.outstandingPayableNet,
                data.businessCashPosition.outstandingPayable,
              )}
              grossLabel={tFinancial('kpis.includingVat')}
              hint={tFinancial('businessCashOutstandingHint')}
              detail={buildBusinessCashOutstandingDetail(
                data.businessCashPosition,
                t('ownerHeadline.payableRemaining'),
                detailCopy,
              )}
              detailCopy={triggerCopy}
            />
          ) : null}
          {data.billing ? (
            <div data-pf-dashboard-metric="customer-receivable">
              <KpiTile
                title={t('ownerHeadline.customerReceivable')}
                money={data.billing.netOutstanding}
                grossMoney={grossWhenVatExists(data.billing.netOutstanding, data.billing.outstanding)}
                grossLabel={tFinancial('kpis.includingVat')}
                hint={t('ownerHeadline.customerReceivableHint')}
                detail={buildCustomerReceivableDetail(
                  data.billing.openBills,
                  data.billing.netOutstanding,
                  data.billing.outstanding,
                  t('ownerHeadline.customerReceivable'),
                  detailCopy,
                  locale,
                )}
                detailCopy={triggerCopy}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {data.cashForecast && showDashboardUi(data, 'owner.cashForecast90') ? (
        <HomeDashboardCashForecast
          cashForecast={data.cashForecast}
          copy={{
            title: t('cashForecast.title'),
            hint: t('cashForecast.hint'),
            expectedIn: t('cashForecast.expectedIn'),
            expectedInHint: t('cashForecast.unbilledNotReceipt'),
            expectedInFormula: t('cashForecast.expectedInFormula'),
            expectedOut: t('cashForecast.expectedOut'),
            expectedOutHint: t('cashForecast.expectedOutHint'),
            expectedOutFormula: t('cashForecast.expectedOutFormula'),
            expectedDifference: t('cashForecast.expectedDifference'),
            expectedDifferenceHint: t('cashForecast.expectedDifferenceHint'),
            expectedDifferenceFormula: t('cashForecast.expectedDifferenceFormula'),
            sources: {
              client_outstanding: tFinancial('cashFlowForecast.sources.client_outstanding'),
              issued_billing: tFinancial('cashFlowForecast.sources.issued_billing'),
              expected_progress_billing: tFinancial('cashFlowForecast.sources.expected_progress_billing'),
              retention_release_in: tFinancial('cashFlowForecast.sources.retention_release_in'),
              certified_subcontract_receipt: tFinancial('cashFlowForecast.sources.certified_subcontract_receipt'),
              vendor_bill: tFinancial('cashFlowForecast.sources.vendor_bill'),
              commitment: tFinancial('cashFlowForecast.sources.commitment'),
              subcontractor_liability: tFinancial('cashFlowForecast.sources.subcontractor_liability'),
              recurring_draft: tFinancial('cashFlowForecast.sources.recurring_draft'),
              retention_release_out: tFinancial('cashFlowForecast.sources.retention_release_out'),
              operating_expense: tFinancial('cashFlowForecast.sources.operating_expense'),
              payroll_obligation: tFinancial('cashFlowForecast.sources.payroll_obligation'),
            },
            includingVat: tFinancial('kpis.includingVat'),
            excluded: t('cashForecast.excluded', {
              later: data.cashForecast.position.excludedLaterCount,
              undated: data.cashForecast.position.excludedUndatedCount,
            }),
            openPage: t('cashForecast.openPage'),
            inHidden: t('cashForecast.inHidden'),
          }}
          detailCopy={triggerCopy}
        />
      ) : null}

      {data.apOutstanding &&
      !data.businessCashPosition?.outstandingPayable &&
      showDashboardUi(data, 'owner.apOutstanding') ? (
        <section className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            title={tFinancial('apOutstanding')}
            money={data.apOutstanding}
            hint={tFinancial('apOutstandingHint')}
            detail={apDetail}
            detailCopy={triggerCopy}
          />
        </section>
      ) : null}

      {showDashboardUi(data, 'owner.restoredSections') ? (
        <HomeDashboardRestoredSections data={data} hideOpenReceivable />
      ) : null}

      {data.monthlyLedger && data.monthlyLedger.months.length > 0 ? (
        <WithAppClientMessages extra={['dashboard']}>
          <HomeDashboardMonthlyLedger ledger={data.monthlyLedger} />
        </WithAppClientMessages>
      ) : null}

      {showDashboardUi(data, 'owner.recentProjects') ? (
        <DashboardRecentProjectsSection
          projects={data.recentProjects}
          workKindFilter={data.workKindFilter}
        />
      ) : null}

      {data.projectTableRows.length > 0 && showDashboardUi(data, 'owner.projectProfitTable') ? (
        <section className="min-w-0 max-w-full">
          <h2 className="mb-2 text-sm font-semibold">{t('ownerHeadline.projectTableTitle')}</h2>
          <ResponsiveTable
            items={[...data.projectTableRows]}
            getRowKey={(row) => row.projectId}
            desktop={
              <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('ownerHeadline.colProject')}</TableHead>
                      <TableHead className="hidden md:table-cell">
                        {t('ownerHeadline.colClient')}
                      </TableHead>
                      <TableHead numeric>{t('ownerHeadline.colValue')}</TableHead>
                      <TableHead numeric>{t('ownerHeadline.colActual')}</TableHead>
                      <TableHead numeric>{t('ownerHeadline.colProfit')}</TableHead>
                      <TableHead numeric>{t('ownerHeadline.colProfitability')}</TableHead>
                      <TableHead>{t('ownerHeadline.colStatus')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.projectTableRows.map((row) => (
                      <TableRow key={row.projectId}>
                        <TableCell>
                          <PrefetchOnIntentLink
                            href={`/projects/${row.projectId}`}
                            className={cn(textNavLinkClassName, 'font-medium')}
                          >
                            {row.name}
                          </PrefetchOnIntentLink>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{row.clientName ?? '—'}</TableCell>
                        <TableCell numeric>
                          {row.currentContract ? <MoneyText value={row.currentContract} /> : '—'}
                        </TableCell>
                        <TableCell numeric>
                          {row.actualCost ? <MoneyText value={row.actualCost} /> : '—'}
                        </TableCell>
                        <TableCell numeric>
                          {row.actualProfit ? <MoneyText value={row.actualProfit} colorizeResult /> : '—'}
                        </TableCell>
                        <TableCell numeric>
                          {row.marginPercent ? (
                            <span
                              dir="ltr"
                              className={`pf-numeric inline-block max-w-full ${
                                Number(row.marginPercent) > 0
                                  ? 'text-[var(--pf-status-success-fg)]'
                                  : Number(row.marginPercent) < 0
                                    ? 'text-[var(--pf-status-danger-fg)]'
                                    : ''
                              }`}
                            >
                              {formatPercentDisplay(row.marginPercent, locale)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <ProjectStatusBadge
                            status={row.status as ProjectStatus}
                            label={tStatus(row.status as ProjectStatus)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            renderMobileCard={(row) => (
              <Link
                href={`/projects/${row.projectId}`}
                className={cn(pressableCardLinkClassName, 'text-start')}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 font-semibold">{row.name}</span>
                  <ProjectStatusBadge
                    status={row.status as ProjectStatus}
                    label={tStatus(row.status as ProjectStatus)}
                  />
                </div>
                <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                  {row.clientName ?? '—'}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-[var(--pf-text-muted)]">{t('ownerHeadline.colValue')}</dt>
                  <dd className="text-end">
                    {row.currentContract ? <MoneyText value={row.currentContract} /> : '—'}
                  </dd>
                  <dt className="text-[var(--pf-text-muted)]">{t('ownerHeadline.colActual')}</dt>
                  <dd className="text-end">
                    {row.actualCost ? <MoneyText value={row.actualCost} /> : '—'}
                  </dd>
                  <dt className="text-[var(--pf-text-muted)]">{t('ownerHeadline.colProfit')}</dt>
                  <dd className="text-end">
                    {row.actualProfit ? <MoneyText value={row.actualProfit} colorizeResult /> : '—'}
                  </dd>
                  <dt className="text-[var(--pf-text-muted)]">
                    {t('ownerHeadline.colProfitability')}
                  </dt>
                  <dd className="text-end">
                    {row.marginPercent ? (
                      <span
                        dir="ltr"
                        className={`pf-numeric inline-block max-w-full ${
                          Number(row.marginPercent) > 0
                            ? 'text-[var(--pf-status-success-fg)]'
                            : Number(row.marginPercent) < 0
                              ? 'text-[var(--pf-status-danger-fg)]'
                              : ''
                        }`}
                      >
                        {formatPercentDisplay(row.marginPercent, locale)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </dd>
                </dl>
              </Link>
            )}
          />
        </section>
      ) : data.activeProjectCount > 0 && data.recentProjects.length === 0 ? (
        <section>
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {t('ownerHeadline.noFinancialRows', { count: data.activeProjectCount })}
          </p>
          <p className="mt-2">
            <Link href="/projects" className={textNavLinkClassName} prefetch={false}>
              {t('allProjectsLink')}
            </Link>
          </p>
        </section>
      ) : null}

      {showDashboardUi(data, 'owner.quickActions') ? (
      <section>
        <h2 className="mb-2 text-sm font-semibold">{t('quickActions')}</h2>
        <div className="flex flex-wrap gap-2">
          {data.canCreateExpense ? (
            <Button asChild size="sm">
              <Link href="/expenses/new" prefetch={false}>
                <Receipt aria-hidden />
                {tNav('newMenu.expense')}
              </Link>
            </Button>
          ) : null}
          {data.canCreateProject ? (
            <Button asChild size="sm" variant="secondary">
              <Link href="/projects/new" prefetch={false}>
                <Plus aria-hidden />
                {tNav('newMenu.project')}
              </Link>
            </Button>
          ) : null}
        </div>
      </section>
      ) : null}

      {showDashboardUi(data, 'owner.reportsLinks') ? (
        <p className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/reports" className={textNavLinkClassName} prefetch={false}>
            {t('ownerHeadline.reportsLink')}
          </Link>
          <Link
            href="/reports?section=management"
            className={textNavLinkClassName}
            prefetch={false}
            data-pf-owner-management-link=""
          >
            {t('ownerLinks.management')}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
