import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { BillingNetPrimaryDisplay } from '@/components/patterns/billing-net-primary-display';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { isZeroMoney, subtractMoney } from '@/shared/money';
import type { RevenueTriplet } from '@/modules/billing/domain/revenue-position';
import type { HomeDashboardData } from '../application/get-home-dashboard';
import type { DashboardKpiKey } from '../domain/dashboard-missing-data';
import type { DashboardKpiDetailContent } from '../domain/dashboard-kpi-detail';
import {
  billingCollectedMonthHref,
  billingIssuedMonthHref,
  buildAllocatedOverheadDetail,
  buildBillingInvoicedDetail,
  buildBillingOutstandingDetail,
  buildBillingPaidDetail,
  buildCommitmentsDetail,
  buildCompanyProfitDetail,
  buildCostsThisMonthDetail,
  buildExpectedRemainingDetail,
  buildForecastCostDetail,
  buildForecastProfitDetail,
  buildInvoicedThisMonthDetail,
  buildUnallocatedBusinessCostsDetail,
} from '../domain/dashboard-kpi-detail-builders';
import {
  cashLineDisplayText,
  type MonthCashExpectedLine,
  type MonthCashPaidLine,
  type MonthCashSource,
} from '../domain/month-cash-flow';
import { formatPayrollPeriodDocument } from '../domain/payroll-cash-display';
import {
  mapDashboardKpiDetailCopy,
  mapDashboardKpiDetailTriggerCopy,
} from './dashboard-kpi-detail-copy';
import { DashboardKpiCard } from './dashboard-kpi-card';
import { MonthCashMonthPicker } from './month-cash-month-picker';
import { standalonePartialNotes } from './map-coverage-sources';

/**
 * Functional dashboard windows omitted when the owner view replaced the full
 * card dashboard. Rendered inside the current owner view — it does not replace it.
 */
export async function HomeDashboardRestoredSections({
  data,
}: {
  data: HomeDashboardData;
}) {
  const [t, tFinancial, locale] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('financial'),
    getLocale(),
  ]);
  const detailCopy = mapDashboardKpiDetailCopy(t);
  const triggerCopy = mapDashboardKpiDetailTriggerCopy(t);
  const kpiBreakdown = data.kpiBreakdown;
  const vatLabels = {
    exVat: t('businessSummary.exVat'),
    vat: t('businessSummary.vatAmount'),
    incVat: tFinancial('kpis.includingVat'),
    noVat: t('businessSummary.noVat'),
  };

  function unavailable(key: DashboardKpiKey): boolean {
    return data.kpiAvailability?.[key] === 'unavailable';
  }

  const forecast = data.forecast;
  const forecastCards = forecast ? (
    <>
      {forecast.totalForecastFinalCost || unavailable('forecastCost') ? (
        <div data-pf-dashboard-metric="forecast-cost">
          <DashboardKpiCard
            title={tFinancial('kpis.forecast')}
            money={unavailable('forecastCost') ? undefined : forecast.totalForecastFinalCost ?? undefined}
            unavailable={unavailable('forecastCost')}
            unavailableLabel={t('missingData.kpiUnavailable')}
            unavailableHint={t('missingData.kpiUnavailableCostHint')}
            hint={unavailable('forecastCost') ? undefined : tFinancial('basis.netExVat')}
            detail={
              forecast.totalForecastFinalCost && !unavailable('forecastCost')
                ? buildForecastCostDetail(
                    forecast.totalForecastFinalCost,
                    {
                      actualCost: forecast.totalActualProjectCost,
                      committed: kpiBreakdown?.committed ?? forecast.totalRemainingCommitments,
                      expectedRemaining:
                        kpiBreakdown?.expectedRemaining ?? forecast.totalExpectedRemaining,
                    },
                    tFinancial('kpis.forecast'),
                    detailCopy,
                  )
                : undefined
            }
            detailCopy={triggerCopy}
          />
        </div>
      ) : null}
      {forecast.totalExpectedRemaining || unavailable('forecastCost') ? (
        <div data-pf-dashboard-metric="expected-remaining">
          <DashboardKpiCard
            title={tFinancial('kpis.expectedRemaining')}
            money={
              unavailable('forecastCost') ? undefined : forecast.totalExpectedRemaining ?? undefined
            }
            unavailable={unavailable('forecastCost')}
            unavailableLabel={t('missingData.kpiUnavailable')}
            unavailableHint={t('missingData.kpiUnavailableCostHint')}
            detail={
              forecast.totalExpectedRemaining && !unavailable('forecastCost')
                ? buildExpectedRemainingDetail(
                    forecast.totalExpectedRemaining,
                    {
                      actualCost: forecast.totalActualProjectCost,
                      committed: kpiBreakdown?.committed ?? forecast.totalRemainingCommitments,
                    },
                    tFinancial('kpis.expectedRemaining'),
                    detailCopy,
                  )
                : undefined
            }
            detailCopy={triggerCopy}
          />
        </div>
      ) : null}
      {forecast.totalAllocatedOverhead || unavailable('actualCost') ? (
        <div data-pf-dashboard-metric="allocated-overhead">
          <DashboardKpiCard
            title={tFinancial('kpis.allocatedOverhead')}
            money={
              unavailable('actualCost') ? undefined : forecast.totalAllocatedOverhead ?? undefined
            }
            unavailable={unavailable('actualCost')}
            unavailableLabel={t('missingData.kpiUnavailable')}
            unavailableHint={t('missingData.kpiUnavailableCostHint')}
            detail={
              forecast.totalAllocatedOverhead && !unavailable('actualCost')
                ? buildAllocatedOverheadDetail(
                    forecast.totalAllocatedOverhead,
                    tFinancial('kpis.allocatedOverhead'),
                    detailCopy,
                  )
                : undefined
            }
            detailCopy={triggerCopy}
          />
        </div>
      ) : null}
      {forecast.totalRemainingCommitments || unavailable('committed') ? (
        <div data-pf-dashboard-metric="commitments">
          <DashboardKpiCard
            title={tFinancial('kpis.committed')}
            money={
              unavailable('committed') ? undefined : forecast.totalRemainingCommitments ?? undefined
            }
            unavailable={unavailable('committed')}
            unavailableLabel={t('missingData.kpiUnavailable')}
            unavailableHint={t('missingData.kpiUnavailableCostHint')}
            detail={
              forecast.totalRemainingCommitments && !unavailable('committed')
                ? buildCommitmentsDetail(
                    forecast.totalRemainingCommitments,
                    tFinancial('kpis.committed'),
                    detailCopy,
                  )
                : undefined
            }
            detailCopy={triggerCopy}
          />
        </div>
      ) : null}
      {data.showProfit && (forecast.totalForecastMargin || unavailable('forecastMargin')) ? (
        <div data-pf-dashboard-metric="forecast-profit">
          <DashboardKpiCard
            title={t('kpiLabels.expectedProfit')}
            money={
              unavailable('forecastMargin') ? undefined : forecast.totalForecastMargin ?? undefined
            }
            unavailable={unavailable('forecastMargin')}
            unavailableLabel={t('missingData.kpiUnavailable')}
            unavailableHint={t('missingData.kpiUnavailableProfitHint')}
            hint={unavailable('forecastMargin') ? undefined : tFinancial('basis.profitNet')}
            detail={
              forecast.totalForecastMargin && !unavailable('forecastMargin')
                ? buildForecastProfitDetail(
                    forecast.totalForecastMargin,
                    data.totalContractValue,
                    forecast.totalForecastFinalCost,
                    t('kpiLabels.expectedProfit'),
                    detailCopy,
                  )
                : undefined
            }
            detailCopy={triggerCopy}
          />
        </div>
      ) : null}
      {forecast.companyProfit ? (
        <div data-pf-dashboard-metric="company-profit">
          <DashboardKpiCard
            title={tFinancial('companyProfit')}
            money={forecast.companyProfit}
            hint={tFinancial('basis.profitNet')}
            detail={
              kpiBreakdown && forecast.companyActual
                ? buildCompanyProfitDetail(
                    forecast.companyProfit,
                    kpiBreakdown,
                    forecast.companyActual,
                    tFinancial('companyProfit'),
                    detailCopy,
                  )
                : undefined
            }
            detailCopy={triggerCopy}
          />
        </div>
      ) : null}
      {kpiBreakdown?.actionableUnallocatedCosts &&
      !isZeroMoney(kpiBreakdown.actionableUnallocatedCosts) ? (
        <div data-pf-dashboard-metric="unallocated-costs">
          <DashboardKpiCard
            title={tFinancial('unallocatedBusinessCosts')}
            money={kpiBreakdown.actionableUnallocatedCosts}
            hint={tFinancial('unallocatedBusinessCostsHint')}
            detail={buildUnallocatedBusinessCostsDetail(
              kpiBreakdown.actionableUnallocatedCosts,
              tFinancial('unallocatedBusinessCosts'),
              detailCopy,
            )}
            detailCopy={triggerCopy}
            footer={
              <p className="break-words text-xs">
                <Link
                  href="/expenses?unallocated=true"
                  className={textNavLinkClassName}
                  prefetch={false}
                >
                  {t('businessSummary.viewUnallocatedExpenses')}
                </Link>
              </p>
            }
          />
        </div>
      ) : null}
    </>
  ) : null;

  const showForecast = Boolean(
    forecast &&
      (forecast.totalForecastFinalCost ||
        forecast.totalExpectedRemaining ||
        forecast.totalAllocatedOverhead ||
        forecast.totalRemainingCommitments ||
        forecast.companyProfit ||
        unavailable('forecastCost') ||
        unavailable('actualCost') ||
        unavailable('committed') ||
        (data.showProfit && (forecast.totalForecastMargin || unavailable('forecastMargin'))) ||
        (kpiBreakdown?.actionableUnallocatedCosts &&
          !isZeroMoney(kpiBreakdown.actionableUnallocatedCosts))),
  );

  const billing = data.showBilling ? data.billing : null;
  const billingNotes = data.billingCoverage
    ? standalonePartialNotes(data.billingCoverage, tFinancial, [
        'foreign_currency_billing_excluded',
      ])
    : [];

  const summary = data.organizationSummary;
  const sourceLabels = {
    payroll: t('businessSummary.cashSource.payroll'),
    expense: t('businessSummary.cashSource.expense'),
    ap: t('businessSummary.cashSource.ap'),
    subcontract_advance: t('businessSummary.cashSource.subcontract_advance'),
  } as const;

  return (
    <>
      {showForecast && forecastCards ? (
        <section className="min-w-0 max-w-full" data-pf-dashboard-forecast="">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {forecastCards}
          </div>
        </section>
      ) : null}

      {billing ? (
        <section className="min-w-0 max-w-full" data-pf-dashboard-billing="">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div data-pf-dashboard-metric="client-billing">
              <DashboardKpiCard
                title={tFinancial('kpis.billed')}
                money={billing.netInvoiced}
                grossMoney={billing.invoiced}
                grossLabel={tFinancial('kpis.includingVat')}
                hint={tFinancial('kpis.billedHint')}
                detail={buildBillingInvoicedDetail(
                  billing.netInvoiced,
                  billing.invoiced,
                  tFinancial('kpis.billed'),
                  detailCopy,
                )}
                detailCopy={triggerCopy}
                footer={
                  billingNotes.length > 0
                    ? billingNotes.map((note) => (
                        <p key={note} className="break-words text-xs text-[var(--pf-text-secondary)]">
                          {note}
                        </p>
                      ))
                    : null
                }
              />
            </div>
            <div data-pf-dashboard-metric="collections-received">
              <DashboardKpiCard
                title={tFinancial('kpis.paid')}
                money={billing.netPaid}
                grossMoney={billing.paid}
                grossLabel={tFinancial('kpis.includingVat')}
                hint={tFinancial('kpis.paidHint')}
                detail={buildBillingPaidDetail(
                  billing.netPaid,
                  billing.paid,
                  tFinancial('kpis.paid'),
                  detailCopy,
                )}
                detailCopy={triggerCopy}
              />
            </div>
            <div data-pf-dashboard-metric="open-receivable">
              <DashboardKpiCard
                title={tFinancial('kpis.outstandingNet')}
                money={billing.netOutstanding}
                grossMoney={billing.outstanding}
                grossLabel={tFinancial('kpis.includingVat')}
                hint={tFinancial('basis.outstandingNet')}
                detail={buildBillingOutstandingDetail(
                  billing.netOutstanding,
                  billing.outstanding,
                  billing.netInvoiced,
                  billing.netPaid,
                  tFinancial('kpis.outstandingNet'),
                  detailCopy,
                )}
                detailCopy={triggerCopy}
              />
            </div>
          </div>
        </section>
      ) : null}

      {summary ? (
        <>
          <div data-pf-dashboard-month-selector="">
            <MonthNavigation
              selectedMonth={data.selectedMonth}
              workKindFilter={data.workKindFilter}
              prevLabel={t('businessSummary.prevMonth')}
              nextLabel={t('businessSummary.nextMonth')}
              chooseMonthLabel={t('businessSummary.chooseMonth')}
            />
          </div>
          <section className="min-w-0 max-w-full" data-pf-dashboard-month-business="">
            <h2 className="mb-2 text-sm font-semibold text-[var(--pf-text-secondary)]">
              {t('businessSummary.title')}
            </h2>
            <h3 className="mb-2 text-sm font-semibold text-[var(--pf-text-secondary)]">
              {t('businessSummary.cashFlowTitle')}
            </h3>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.showBilling ? (
                <div data-pf-dashboard-metric="collections-actual">
                  <DashboardKpiCard
                    title={t('businessSummary.collectionsActual')}
                    money={summary.monthCash.display.collections.net}
                    grossMoney={summary.monthCash.display.collections.gross}
                    grossLabel={vatLabels.incVat}
                    hint={t('businessSummary.collectionsActualHint')}
                    detail={monthCashTripletDetail(
                      t('businessSummary.collectionsActual'),
                      summary.monthCash.display.collections,
                      t('businessSummary.collectionsActualWhat'),
                      t('businessSummary.collectionsActualFormula'),
                      vatLabels,
                      billingCollectedMonthHref(data.selectedMonth),
                      t('businessSummary.viewMonthCollections'),
                    )}
                    detailCopy={triggerCopy}
                  />
                </div>
              ) : null}
              <div data-pf-dashboard-metric="paid-actual">
                <DashboardKpiCard
                  title={t('businessSummary.paidActual')}
                  money={summary.monthCash.display.paid.net}
                  grossMoney={summary.monthCash.display.paid.gross}
                  grossLabel={vatLabels.incVat}
                  hint={t('businessSummary.paidActualHint')}
                  detail={monthCashPaidDetail(
                    summary.monthCash.paidLines,
                    summary.monthCash.display.paid,
                    t('businessSummary.paidActual'),
                    t('businessSummary.paidActualWhat'),
                    t('businessSummary.paidActualFormula'),
                    vatLabels,
                    sourceLabels,
                    locale,
                  )}
                  detailCopy={triggerCopy}
                />
              </div>
              <div data-pf-dashboard-metric="expected-outgoing">
                <DashboardKpiCard
                  title={t('businessSummary.expectedOutgoing')}
                  money={summary.monthCash.display.expected.net}
                  grossMoney={summary.monthCash.display.expected.gross}
                  grossLabel={vatLabels.incVat}
                  hint={t('businessSummary.expectedOutgoingHint')}
                  detail={monthCashExpectedDetail(
                    summary.monthCash.expectedLines,
                    summary.monthCash.display.expected,
                    t('businessSummary.expectedOutgoing'),
                    t('businessSummary.expectedOutgoingWhat'),
                    t('businessSummary.expectedOutgoingFormula'),
                    {
                      unpaid: t('businessSummary.cashStatusUnpaid'),
                      partial: t('businessSummary.cashStatusPartial'),
                      open: t('businessSummary.cashStatusOpen'),
                    },
                    vatLabels,
                    sourceLabels,
                    locale,
                  )}
                  detailCopy={triggerCopy}
                />
              </div>
              <div data-pf-dashboard-metric="net-cash">
                <DashboardKpiCard
                  title={t('businessSummary.netCash')}
                  money={summary.monthCash.display.netCash.net}
                  grossMoney={summary.monthCash.display.netCash.gross}
                  grossLabel={vatLabels.incVat}
                  hint={t('businessSummary.netCashHint')}
                  detail={monthCashTripletDetail(
                    t('businessSummary.netCash'),
                    summary.monthCash.display.netCash,
                    t('businessSummary.netCashWhat'),
                    t('businessSummary.netCashFormula'),
                    vatLabels,
                  )}
                  detailCopy={triggerCopy}
                />
              </div>
            </div>
            <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-2 text-sm text-[var(--pf-text-secondary)]">
              <span>{t('businessSummary.forecastAfterRemaining')}</span>
              <BillingNetPrimaryDisplay
                netAmount={summary.monthCash.display.forecast.net}
                grossAmount={summary.monthCash.display.forecast.gross}
                grossLabel={vatLabels.incVat}
                netClassName="text-sm"
                colorizeNegative
              />
            </div>
            <h3 className="mt-4 mb-2 text-sm font-semibold text-[var(--pf-text-secondary)]">
              {t('businessSummary.profitabilityTitle')}
            </h3>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              {data.showBilling ? (
                <div data-pf-dashboard-metric="invoiced-this-month">
                  <DashboardKpiCard
                    title={t('businessSummary.invoicedThisMonth')}
                    money={summary.invoicedThisMonth}
                    grossMoney={summary.grossInvoicedThisMonth}
                    grossLabel={vatLabels.incVat}
                    hint={detailCopy.invoicedThisMonthWhat}
                    detail={buildInvoicedThisMonthDetail(
                      summary.invoicedThisMonth,
                      summary.grossInvoicedThisMonth,
                      data.selectedMonth,
                      t('businessSummary.invoicedThisMonth'),
                      detailCopy,
                      vatLabels,
                    )}
                    detailCopy={triggerCopy}
                    footer={
                      <p className="break-words text-xs">
                        <Link
                          href={billingIssuedMonthHref(data.selectedMonth)}
                          className={textNavLinkClassName}
                          prefetch={false}
                        >
                          {t('businessSummary.viewMonthBillings')}
                        </Link>
                      </p>
                    }
                  />
                </div>
              ) : null}
              <div data-pf-dashboard-metric="costs-this-month">
                <DashboardKpiCard
                  title={t('businessSummary.costsThisMonth')}
                  money={summary.costsThisMonth}
                  grossMoney={summary.grossCostsThisMonth}
                  grossLabel={vatLabels.incVat}
                  hint={detailCopy.costsThisMonthWhat}
                  detail={buildCostsThisMonthDetail(
                    summary.costsThisMonth,
                    data.selectedMonth,
                    t('businessSummary.costsThisMonth'),
                    detailCopy,
                    summary.grossCostsThisMonth,
                    vatLabels,
                  )}
                  detailCopy={triggerCopy}
                />
              </div>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}

function monthCashTripletDetail(
  title: string,
  value: RevenueTriplet,
  whatIs: string,
  formula: string,
  labels: { exVat: string; vat: string; incVat: string; noVat: string },
  fullScreenHref?: string,
  fullScreenLabel?: string,
): DashboardKpiDetailContent {
  return {
    title,
    value: value.net,
    grossValue: value.gross,
    grossLabel: labels.incVat,
    whatIs,
    formula,
    fullScreenHref,
    fullScreenLabel,
    breakdown: [
      {
        label: labels.exVat,
        money: value.net,
        vat: value.vat,
        gross: value.gross,
        vatLabel: labels.vat,
        grossLabel: labels.incVat,
        noVatLabel: labels.noVat,
      },
    ],
  };
}

function cashLineAmounts(
  display: RevenueTriplet | undefined,
  cash: DashboardKpiDetailContent['value'],
  labels: { exVat: string; vat: string; incVat: string; noVat: string },
) {
  const net = display?.net ?? cash;
  const gross = display?.gross ?? cash;
  const vat = display?.vat ?? (net && gross ? subtractMoney(gross, net) : null);
  return {
    money: net,
    vat,
    gross,
    vatLabel: labels.vat,
    grossLabel: labels.incVat,
    noVatLabel: labels.noVat,
  };
}

function cashDrilldownLabel(
  source: MonthCashSource,
  parts: readonly (string | null | undefined)[],
  sourceLabels: Readonly<Record<MonthCashSource, string>>,
  locale: string,
): string {
  const visible = parts
    .map((part, index) => {
      if (source === 'payroll' && index === 1 && part) {
        return formatPayrollPeriodDocument(part, locale);
      }
      return cashLineDisplayText(part);
    })
    .filter(Boolean);
  if (visible.length === 0) return sourceLabels[source];
  return visible.join(' · ');
}

function monthCashPaidDetail(
  lines: readonly MonthCashPaidLine[],
  total: RevenueTriplet,
  title: string,
  whatIs: string,
  formula: string,
  labels: { exVat: string; vat: string; incVat: string; noVat: string },
  sourceLabels: Readonly<Record<MonthCashSource, string>>,
  locale: string,
): DashboardKpiDetailContent {
  const ordered = [...lines].sort((left, right) => {
    if (left.source === right.source) return 0;
    if (left.source === 'payroll') return -1;
    if (right.source === 'payroll') return 1;
    return 0;
  });
  return {
    title,
    value: total.net,
    grossValue: total.gross,
    grossLabel: labels.incVat,
    whatIs,
    formula,
    breakdown: ordered.map((line) => ({
      label: cashDrilldownLabel(
        line.source,
        [line.party, line.document, line.paymentDate, line.reference],
        sourceLabels,
        locale,
      ),
      ...cashLineAmounts(line.display, line.amount, labels),
    })),
  };
}

function monthCashExpectedDetail(
  lines: readonly MonthCashExpectedLine[],
  total: RevenueTriplet,
  title: string,
  whatIs: string,
  formula: string,
  statusLabels: Readonly<Record<string, string>>,
  labels: { exVat: string; vat: string; incVat: string; noVat: string },
  sourceLabels: Readonly<Record<MonthCashSource, string>>,
  locale: string,
): DashboardKpiDetailContent {
  const ordered = [...lines].sort((left, right) => {
    if (left.source === right.source) return 0;
    if (left.source === 'payroll') return -1;
    if (right.source === 'payroll') return 1;
    return 0;
  });
  return {
    title,
    value: total.net,
    grossValue: total.gross,
    grossLabel: labels.incVat,
    whatIs,
    formula,
    breakdown: ordered.map((line) => ({
      label: cashDrilldownLabel(
        line.source,
        [
          line.party,
          line.document,
          line.dueDate,
          line.paymentTerms,
          statusLabels[line.status] ?? line.status,
        ],
        sourceLabels,
        locale,
      ),
      ...cashLineAmounts(line.display, line.remaining, labels),
    })),
  };
}

function MonthNavigation({
  selectedMonth,
  workKindFilter,
  prevLabel,
  nextLabel,
  chooseMonthLabel,
}: {
  selectedMonth: string;
  workKindFilter: string | null;
  prevLabel: string;
  nextLabel: string;
  chooseMonthLabel: string;
}) {
  const parts = selectedMonth.split('-');
  const year = parseInt(parts[0] ?? '2024', 10);
  const month = parseInt(parts[1] ?? '1', 10);
  const prevDate = new Date(year, month - 2, 1);
  const nextDate = new Date(year, month, 1);
  const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const nextMonthStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
  const todayMonthStr = new Date().toISOString().slice(0, 7);
  const isCurrentOrFuture = selectedMonth >= todayMonthStr;

  const buildUrl = (value: string) => {
    const params = new URLSearchParams();
    params.set('month', value);
    if (workKindFilter && workKindFilter !== 'all') {
      params.set('workKind', workKindFilter);
    }
    return `/?${params.toString()}`;
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" dir="ltr">
      <Link
        href={buildUrl(prevMonthStr)}
        className={cn(textNavLinkClassName, 'flex size-9 items-center justify-center rounded')}
        prefetch={false}
        scroll={false}
        aria-label={prevLabel}
      >
        <ChevronLeft className="size-4" aria-hidden />
      </Link>
      <MonthCashMonthPicker
        selectedMonth={selectedMonth}
        workKindFilter={workKindFilter}
        label={chooseMonthLabel}
      />
      {!isCurrentOrFuture ? (
        <Link
          href={buildUrl(nextMonthStr)}
          className={cn(textNavLinkClassName, 'flex size-9 items-center justify-center rounded')}
          prefetch={false}
          scroll={false}
          aria-label={nextLabel}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span
          className="flex size-9 items-center justify-center rounded text-[var(--pf-text-muted)] opacity-40"
          aria-hidden
        >
          <ChevronRight className="size-4" />
        </span>
      )}
    </div>
  );
}
