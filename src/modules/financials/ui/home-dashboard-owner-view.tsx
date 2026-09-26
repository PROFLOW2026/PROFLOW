import type React from 'react';
import { Plus, Receipt } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PrefetchOnIntentLink } from '@/components/ui/prefetch-on-intent-link';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/shared/ui/cn';
import { ProjectStatusBadge } from '@/app/[locale]/(app)/projects/project-status-badge';
import type { ProjectStatus } from '@/modules/projects';
import type { HomeDashboardData } from '../application/get-home-dashboard';
import { partitionDashboardCompletenessItems } from '../domain/dashboard-missing-data';
import {
  buildActualCostDetail,
  buildApOutstandingDetail,
  buildBusinessCashOutstandingDetail,
  buildBusinessCashPaidDetail,
  buildCompanyActualDetail,
  buildContractValueDetail,
  buildCurrentProfitDetail,
  buildProfitabilityRateDetail,
} from '../domain/dashboard-kpi-detail-builders';
import type { DashboardKpiDetailContent } from '../domain/dashboard-kpi-detail';
import { DashboardMissingDataTrigger } from './dashboard-missing-data-trigger';
import { HomeLaborReconciliation, HomePendingTimeAlert } from './home-labor-alerts';
import { mapDashboardMissingDataToView } from './map-dashboard-missing-data-view';
import { DashboardQuickAccessSection } from './dashboard-quick-access-section';
import { DashboardAttentionCards } from './dashboard-attention-cards';
import { DashboardContractSummaryRow } from './dashboard-contract-summary-row';
import { DashboardRecentProjectsSection } from './dashboard-recent-projects-section';
import { DashboardKpiDetailTrigger } from './dashboard-kpi-detail-trigger';
import { HomeDashboardCashForecast } from './home-dashboard-cash-forecast';
import {
  mapDashboardKpiDetailCopy,
  mapDashboardKpiDetailTriggerCopy,
} from './dashboard-kpi-detail-copy';

interface HomeDashboardOwnerViewProps {
  readonly data: HomeDashboardData;
}

function KpiTile({
  title,
  money,
  percent,
  hint,
  footer,
  detail,
  detailCopy,
  unavailable,
  unavailableLabel,
}: {
  title: string;
  money?: { amount: string; currency: string };
  percent?: string | null;
  hint?: string;
  footer?: React.ReactNode;
  detail?: DashboardKpiDetailContent;
  detailCopy?: ReturnType<typeof mapDashboardKpiDetailTriggerCopy>;
  unavailable?: boolean;
  unavailableLabel?: string;
}) {
  return (
    <Card className="min-w-0 max-w-full">
      <CardContent className="flex min-w-0 flex-col gap-1 p-4">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className="text-xs text-[var(--pf-text-muted)]">{title}</p>
          {detail && detailCopy ? (
            <DashboardKpiDetailTrigger detail={detail} copy={detailCopy} />
          ) : null}
        </div>
        {unavailable ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{unavailableLabel}</p>
        ) : percent != null ? (
          <p className="text-lg font-semibold tabular-nums" dir="ltr">
            {percent}%
          </p>
        ) : money ? (
          <p className="min-w-0 max-w-full overflow-x-auto text-lg font-semibold">
            <MoneyText value={money} />
          </p>
        ) : (
          <p className="text-sm text-[var(--pf-text-secondary)]">—</p>
        )}
        {hint ? <p className="break-words text-xs text-[var(--pf-text-muted)]">{hint}</p> : null}
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
      ? buildActualCostDetail(actualCostMoney, tFinancial('actualCostToDate'), detailCopy, kpiBreakdown)
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
    ? buildApOutstandingDetail(data.apOutstanding, tFinancial('apOutstanding'), detailCopy)
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
    ? 'grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4'
    : 'grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4">
      {data.pendingTime ? (
        <HomePendingTimeAlert pendingTime={data.pendingTime} canApproveTime={data.canApproveTime} />
      ) : null}
      {data.laborReconciliation ? (
        <HomeLaborReconciliation laborReconciliation={data.laborReconciliation} />
      ) : null}
      <DashboardQuickAccessSection shortcuts={data.quickAccessShortcuts} />
      <DashboardAttentionCards attention={data.attention} />
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

      {data.contractSummary ? (
        <DashboardContractSummaryRow
          summary={data.contractSummary}
          netInvoiced={data.contractNetInvoiced}
        />
      ) : null}

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
          title={tFinancial('actualCostToDate')}
          money={actualCostMoney}
          unavailable={costUnavailable}
          unavailableLabel={t('missingData.kpiUnavailable')}
          hint={costUnavailable ? undefined : tFinancial('basis.actualNotCash')}
          detail={actualCostDetail}
          detailCopy={triggerCopy}
        />
        <KpiTile
          title={t('ownerHeadline.actualProfit')}
          money={data.actualProfitTotal ?? undefined}
          unavailable={profitUnavailable}
          unavailableLabel={t('missingData.kpiUnavailable')}
          hint={profitUnavailable ? undefined : t('ownerHeadline.actualProfitHint')}
          detail={currentProfitDetail}
          detailCopy={triggerCopy}
        />
        <KpiTile
          title={t('ownerHeadline.profitability')}
          percent={data.profitabilityPercent}
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

      {data.forecast?.companyActual != null || data.businessCashPosition ? (
        <section className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.forecast?.companyActual != null ? (
            <KpiTile
              title={tFinancial('companyActual')}
              money={data.forecast.companyActual}
              hint={tFinancial('companyActualDashboardHint')}
              detail={
                kpiBreakdown
                  ? buildCompanyActualDetail(
                      data.forecast.companyActual,
                      kpiBreakdown,
                      tFinancial('companyActual'),
                      detailCopy,
                    )
                  : undefined
              }
              detailCopy={triggerCopy}
            />
          ) : null}
          {data.businessCashPosition?.actualPaid ? (
            <KpiTile
              title={tFinancial('businessCashPaid')}
              money={data.businessCashPosition.actualPaid}
              hint={tFinancial('businessCashPaidHint')}
              detail={buildBusinessCashPaidDetail(
                data.businessCashPosition,
                tFinancial('businessCashPaid'),
                detailCopy,
              )}
              detailCopy={triggerCopy}
            />
          ) : null}
          {data.businessCashPosition?.outstandingPayable ? (
            <KpiTile
              title={tFinancial('businessCashOutstanding')}
              money={data.businessCashPosition.outstandingPayable}
              hint={tFinancial('businessCashOutstandingHint')}
              detail={buildBusinessCashOutstandingDetail(
                data.businessCashPosition,
                tFinancial('businessCashOutstanding'),
                detailCopy,
              )}
              detailCopy={triggerCopy}
            />
          ) : null}
        </section>
      ) : null}

      {data.cashForecast ? (
        <HomeDashboardCashForecast
          cashForecast={data.cashForecast}
          copy={{
            title: t('cashForecast.title'),
            hint: t('cashForecast.hint'),
            opening: t('cashForecast.opening'),
            openingUnset: t('cashForecast.openingUnset'),
            openingAsOf: data.cashForecast.openingAsOf
              ? t('cashForecast.openingAsOf', { date: data.cashForecast.openingAsOf })
              : t('cashForecast.opening'),
            expectedIn: t('cashForecast.expectedIn'),
            expectedOut: t('cashForecast.expectedOut'),
            endBalance: t('cashForecast.endBalance'),
            lowest: t('cashForecast.lowest'),
            excluded: t('cashForecast.excluded', {
              later: data.cashForecast.position.excludedLaterCount,
              undated: data.cashForecast.position.excludedUndatedCount,
            }),
            openPage: t('cashForecast.openPage'),
            inHidden: t('cashForecast.inHidden'),
          }}
        />
      ) : null}

      {data.apOutstanding && !data.businessCashPosition?.outstandingPayable ? (
        <section className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            title={tFinancial('apOutstanding')}
            money={data.apOutstanding}
            hint={tFinancial('apOutstandingHint')}
            detail={apDetail}
            detailCopy={triggerCopy}
            footer={
              <p className="break-words text-xs">
                <Link
                  href="/procurement/ap?outstanding=1"
                  className={textNavLinkClassName}
                  prefetch={false}
                >
                  {t('businessSummary.viewApOutstanding')}
                </Link>
              </p>
            }
          />
        </section>
      ) : null}

      <DashboardRecentProjectsSection
        projects={data.recentProjects}
        workKindFilter={data.workKindFilter}
      />

      {data.projectTableRows.length > 0 ? (
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
                          {row.actualProfit ? <MoneyText value={row.actualProfit} /> : '—'}
                        </TableCell>
                        <TableCell numeric>
                          {row.marginPercent ? (
                            <span dir="ltr">{row.marginPercent}%</span>
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
                    {row.actualProfit ? <MoneyText value={row.actualProfit} /> : '—'}
                  </dd>
                  <dt className="text-[var(--pf-text-muted)]">
                    {t('ownerHeadline.colProfitability')}
                  </dt>
                  <dd className="text-end" dir="ltr">
                    {row.marginPercent ? `${row.marginPercent}%` : '—'}
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

      <p className="text-sm">
        <Link href="/reports" className={textNavLinkClassName} prefetch={false}>
          {t('ownerHeadline.reportsLink')}
        </Link>
      </p>
    </div>
  );
}
