import 'server-only';

import { getTranslations } from 'next-intl/server';
import type { ReportSection } from '@/modules/reports/domain/types';
import { businessDate } from '@/shared/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import type { RecognizedCostBreakdownLine } from '../data/expenses.repository';
import type { BusinessProfitabilityData } from './get-business-profitability';
import type { CashPaidBreakdownData } from './get-cash-paid-breakdown';
import type { FinancialsOverviewData } from './get-financials-overview';
import type { RecognizedCostBreakdownData } from './get-recognized-cost-breakdown';
import { cashLineDisplayText, type MonthCashPaidLine, type MonthCashSource } from '../domain/month-cash-flow';
import { formatPayrollPeriodDocument } from '../domain/payroll-cash-display';
import { zeroMoney } from '@/shared/money';
import { buildFinancialReportPayload, moneyCell } from './build-financial-report-payload';

function periodLabel(locale: string, from: string, to: string, template: string): string {
  return template
    .replace('{from}', formatBusinessDate(businessDate(from), locale, 'short'))
    .replace('{to}', formatBusinessDate(businessDate(to), locale, 'short'));
}

function kpiRow(label: string, value: string, hint?: string) {
  return { label, value: hint ? `${value} (${hint})` : value };
}

export async function buildFinancialOverviewPrintPayload(
  locale: string,
  companyName: string,
  data: FinancialsOverviewData,
): Promise<ReturnType<typeof buildFinancialReportPayload>> {
  const t = await getTranslations({ locale, namespace: 'financial.overview' });
  const period = periodLabel(locale, data.period.fromDate, data.period.toDate, t('printPeriod'));

  const costRows = [
    kpiRow(t('recognizedActual'), moneyCell(data.costs.recognizedActual.value, locale), t('recognizedActualHint')),
    kpiRow(t('cashPaid'), moneyCell(data.costs.cashPaid.value, locale), t('cashPaidHint')),
    kpiRow(t('openPayables'), moneyCell(data.costs.openPayables.value, locale), t('openPayablesHint')),
    kpiRow(t('commitments'), moneyCell(data.costs.commitments.value, locale), t('commitmentsHint')),
    kpiRow(t('upcomingDue'), moneyCell(data.costs.upcomingDue.value, locale), t('upcomingDueHint')),
  ];

  const revenueRows = [
    kpiRow(t('billed'), moneyCell(data.revenue.billed.value, locale), t('billedHint')),
    kpiRow(t('collected'), moneyCell(data.revenue.collected.value, locale), t('collectedHint')),
    kpiRow(t('openReceivables'), moneyCell(data.revenue.openReceivables.value, locale), t('openReceivablesHint')),
    kpiRow(t('overdueAr'), moneyCell(data.revenue.overdueAr.value, locale), t('overdueArHint')),
  ];

  const sections: ReportSection[] = [
    { id: 'costs', heading: t('costsTitle'), rows: costRows },
    { id: 'revenue', heading: t('revenueTitle'), rows: revenueRows },
  ];

  if (data.upcomingCashOut) {
    sections.push({
      id: 'cash-out',
      heading: t('cashOutTitle'),
      rows: [kpiRow(t('upcomingCashOut'), moneyCell(data.upcomingCashOut.value, locale), t('upcomingCashOutHint'))],
    });
  }

  return buildFinancialReportPayload({
    locale,
    title: t('pageTitle'),
    companyName,
    periodLabel: period,
    notices: [t('pageHint')],
    sections,
  });
}

function recognizedLineDescription(
  line: RecognizedCostBreakdownLine,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (line.sourceKind === 'employer_cost') {
    return t('emcDescription', { month: line.description });
  }
  if (line.installmentCount > 1) {
    return t('installmentDescription', {
      text: line.description || t('fallbackExpense'),
      month: line.yearMonth,
    });
  }
  return line.description || t('fallbackExpense');
}

function recognizedAllocation(
  line: RecognizedCostBreakdownLine,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (line.sourceKind === 'employer_cost') return t('allocation.employerCost');
  if (line.projectName) return t('allocation.project', { name: line.projectName });
  if (line.costFamily === 'business_overhead') return t('allocation.overhead');
  if (line.sourceKind === 'ap_bill') return t('allocation.apCompany');
  return line.costFamily ? t('allocation.costFamily', { family: line.costFamily }) : t('allocation.unassigned');
}

export async function buildRecognizedBreakdownPrintPayload(
  locale: string,
  companyName: string,
  data: RecognizedCostBreakdownData,
): Promise<ReturnType<typeof buildFinancialReportPayload>> {
  const t = await getTranslations({ locale, namespace: 'financial.overview.recognizedBreakdown' });
  const tOverview = await getTranslations({ locale, namespace: 'financial.overview' });
  const period = periodLabel(locale, data.period.fromDate, data.period.toDate, t('printPeriod'));

  const summary: ReportSection = {
    id: 'summary',
    heading: t('totalTitle'),
    rows: [
      { label: t('columnNet'), value: moneyCell(data.totalNet, locale) },
      { label: t('columnVat'), value: moneyCell(data.totalVat, locale) },
      { label: t('columnGross'), value: moneyCell(data.totalGross, locale) },
    ],
  };

  const tableRows = data.lines.map((line) => [
    line.recognitionDate,
    t(`source.${line.sourceKind}`),
    line.party || '—',
    recognizedLineDescription(line, t as (key: string, values?: Record<string, string | number>) => string),
    recognizedAllocation(line, t as (key: string, values?: Record<string, string | number>) => string),
    moneyCell(line.net, locale),
    moneyCell(line.vat, locale),
    moneyCell(line.gross, locale),
  ]);

  const detail: ReportSection = {
    id: 'lines',
    heading: t('detailSectionTitle'),
    tables: [
      {
        headers: [
          t('columnRecognitionDate'),
          t('columnSource'),
          t('columnParty'),
          t('columnDescription'),
          t('columnAllocation'),
          t('columnNet'),
          t('columnVat'),
          t('columnGross'),
        ],
        rows: tableRows,
      },
    ],
  };

  return buildFinancialReportPayload({
    locale,
    title: t('pageTitle'),
    companyName,
    periodLabel: period,
    notices: [t('pageHint'), t('scopeHint'), tOverview('recognizedActualHint')],
    sections: [summary, detail],
  });
}

function cashDocumentLabel(
  line: MonthCashPaidLine,
  sourceLabels: Record<MonthCashSource, string>,
  locale: string,
): string {
  const parts = [line.document, line.reference ?? ''];
  const visible = parts
    .map((part, index) => {
      if (line.source === 'payroll' && index === 0 && part) {
        return formatPayrollPeriodDocument(part, locale);
      }
      return cashLineDisplayText(part);
    })
    .filter(Boolean);
  if (visible.length === 0) return sourceLabels[line.source];
  return visible.join(' · ');
}

export async function buildCashPaidBreakdownPrintPayload(
  locale: string,
  companyName: string,
  data: CashPaidBreakdownData,
): Promise<ReturnType<typeof buildFinancialReportPayload>> {
  const t = await getTranslations({ locale, namespace: 'financial.overview.cashPaidBreakdown' });
  const tOverview = await getTranslations({ locale, namespace: 'financial.overview' });
  const period = periodLabel(locale, data.period.fromDate, data.period.toDate, t('printPeriod'));
  const display = data.flow.display.paid;

  const sourceLabels: Record<MonthCashSource, string> = {
    payroll: t('source.payroll'),
    expense: t('source.expense'),
    ap: t('source.ap'),
    subcontract_advance: t('source.subcontract_advance'),
  };

  const summary: ReportSection = {
    id: 'summary',
    heading: t('totalTitle'),
    rows: [
      { label: t('columnNet'), value: moneyCell(display.net, locale) },
      { label: t('columnVat'), value: moneyCell(display.vat, locale) },
      { label: t('columnGross'), value: moneyCell(display.gross, locale) },
    ],
  };

  const tableRows = data.paidLines.map((line) => {
    const triplet = line.display;
    const net = triplet?.net ?? line.amount;
    const gross = triplet?.gross ?? line.amount;
    const vat = triplet?.vat ?? zeroMoney(line.amount.currency);
    return [
      line.paymentDate,
      sourceLabels[line.source],
      cashLineDisplayText(line.party) || '—',
      cashDocumentLabel(line, sourceLabels, locale),
      moneyCell(net, locale),
      moneyCell(vat, locale),
      moneyCell(gross, locale),
    ];
  });

  const detail: ReportSection = {
    id: 'lines',
    heading: t('detailSectionTitle'),
    tables: [
      {
        headers: [
          t('columnPaymentDate'),
          t('columnSource'),
          t('columnParty'),
          t('columnDocument'),
          t('columnNet'),
          t('columnVat'),
          t('columnGross'),
        ],
        rows: tableRows,
      },
    ],
  };

  return buildFinancialReportPayload({
    locale,
    title: t('pageTitle'),
    companyName,
    periodLabel: period,
    notices: [t('pageHint'), t('scopeHint'), tOverview('cashPaidHint')],
    sections: [summary, detail],
  });
}

export async function buildBusinessProfitabilityPrintPayload(
  locale: string,
  companyName: string,
  data: BusinessProfitabilityData,
): Promise<ReturnType<typeof buildFinancialReportPayload>> {
  const t = await getTranslations({ locale, namespace: 'financial.businessProfitability' });
  const tFinancial = await getTranslations({ locale, namespace: 'financial' });

  const commercial = [
    kpiRow(t('kpis.currentContract'), moneyCell(data.currentContractValue.value, locale), t('kpis.currentContractHint')),
    kpiRow(
      t('kpis.contractualCurrentProfit'),
      moneyCell(data.contractualCurrentProfit.value, locale),
      t('kpis.contractualCurrentProfitHint'),
    ),
    kpiRow(t('kpis.forecastProfit'), moneyCell(data.forecastProfit.value, locale), t('kpis.forecastProfitHint')),
  ];

  const billing = [
    kpiRow(t('kpis.netBilled'), moneyCell(data.netBilled.value, locale), t('kpis.netBilledHint')),
    kpiRow(t('kpis.netCollected'), moneyCell(data.netCollected.value, locale), t('kpis.netCollectedHint')),
    kpiRow(t('kpis.netOutstandingAr'), moneyCell(data.netOutstandingAr.value, locale), t('kpis.netOutstandingArHint')),
  ];

  const costs = [
    kpiRow(t('kpis.directProjectCost'), moneyCell(data.directProjectCost.value, locale), t('kpis.directProjectCostHint')),
    kpiRow(t('kpis.allocatedOverhead'), moneyCell(data.allocatedOverhead.value, locale), t('kpis.allocatedOverheadHint')),
    kpiRow(t('kpis.companyOnlyCost'), moneyCell(data.companyOnlyCost.value, locale), t('kpis.companyOnlyCostHint')),
    kpiRow(t('kpis.companyActual'), moneyCell(data.companyActual.value, locale), t('kpis.companyActualHint')),
    kpiRow(t('kpis.companyProfit'), moneyCell(data.companyProfit.value, locale), t('kpis.companyProfitHint')),
    kpiRow(t('kpis.apOutstanding'), moneyCell(data.apOutstanding.value, locale), t('kpis.apOutstandingHint')),
  ];

  const forecast = [
    kpiRow(t('kpis.openCommitments'), moneyCell(data.openCommitments.value, locale), t('kpis.openCommitmentsHint')),
    kpiRow(
      t('kpis.expectedRemainingCost'),
      moneyCell(data.expectedRemainingCost.value, locale),
      t('kpis.expectedRemainingCostHint'),
    ),
    kpiRow(t('kpis.forecastFinalCost'), moneyCell(data.forecastFinalCost.value, locale), t('kpis.forecastFinalCostHint')),
  ];

  return buildFinancialReportPayload({
    locale,
    title: t('pageTitle'),
    companyName,
    periodLabel: t('printPeriodCumulative'),
    notices: [t('pageHint'), t('disclaimer'), t('scopeNote'), tFinancial('profitVsCash'), t('billingNote'), t('forecastFormula')],
    sections: [
      { id: 'commercial', heading: t('sections.commercial'), rows: commercial },
      { id: 'billing', heading: t('sections.billing'), rows: billing },
      { id: 'costs', heading: t('sections.costs'), rows: costs },
      { id: 'forecast', heading: t('sections.forecast'), rows: forecast },
    ],
  });
}
