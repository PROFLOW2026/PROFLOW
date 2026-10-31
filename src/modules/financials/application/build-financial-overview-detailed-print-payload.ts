import 'server-only';

import { getTranslations } from 'next-intl/server';
import type { BillingRecordSummary, PaymentApplicationRow } from '@/modules/billing/domain/types';
import type { ReportSection } from '@/modules/reports/domain/types';
import { businessDate, addDays } from '@/shared/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import {
  addMoney,
  isPositiveMoney,
  isZeroMoney,
  money,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { RecognizedCostBreakdownLine } from '../data/expenses.repository';
import {
  cashLineDisplayText,
  type MonthCashExpectedLine,
  type MonthCashPaidLine,
  type MonthCashSource,
} from '../domain/month-cash-flow';
import { formatPayrollPeriodDocument } from '../domain/payroll-cash-display';
import type { FinancialsOverviewData } from './get-financials-overview';
import type { FinancialOverviewDetailedReportData } from './load-financial-overview-detailed-report-data';
import { buildFinancialOverviewPrintPayload } from './build-financial-print-reports';
import { buildFinancialReportPayload, moneyCell } from './build-financial-report-payload';

function periodLabel(locale: string, from: string, to: string, template: string): string {
  return template
    .replace('{from}', formatBusinessDate(businessDate(from), locale, 'short'))
    .replace('{to}', formatBusinessDate(businessDate(to), locale, 'short'));
}

function headingWithCount(title: string, count: number): string {
  return `${title} (${count})`;
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

type RollupRow = readonly [string, string, string];

function rollupRecognizedNet(
  lines: readonly RecognizedCostBreakdownLine[],
  currency: string,
  locale: string,
  keyFn: (line: RecognizedCostBreakdownLine) => string,
): RollupRow[] {
  const map = new Map<string, { net: MoneyValue; count: number }>();
  for (const line of lines) {
    if (line.estimate || line.undatedApBill) continue;
    const key = keyFn(line) || '—';
    const prev = map.get(key) ?? { net: zeroMoney(currency), count: 0 };
    map.set(key, { net: addMoney(prev.net, line.net), count: prev.count + 1 });
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, locale))
    .map(([key, { net, count }]) => [key, String(count), moneyCell(net, locale)]);
}

function rollupCashGross(
  lines: readonly MonthCashPaidLine[],
  currency: string,
  keyFn: (line: MonthCashPaidLine) => string,
  locale: string,
): RollupRow[] {
  const map = new Map<string, { gross: MoneyValue; count: number }>();
  for (const line of lines) {
    const key = keyFn(line) || '—';
    const gross = line.display?.gross ?? line.amount;
    const prev = map.get(key) ?? { gross: zeroMoney(currency), count: 0 };
    map.set(key, { gross: addMoney(prev.gross, gross), count: prev.count + 1 });
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'he'))
    .map(([key, { gross, count }]) => [key, String(count), moneyCell(gross, locale)]);
}

function billingNet(record: BillingRecordSummary): MoneyValue {
  return record.subtotalAmount ?? record.totalAmount;
}

function billingVat(record: BillingRecordSummary, currency: string): MoneyValue {
  return record.taxAmount ?? zeroMoney(currency);
}

export async function buildFinancialOverviewDetailedPrintPayload(
  locale: string,
  companyName: string,
  overview: FinancialsOverviewData,
  detailed: FinancialOverviewDetailedReportData,
): Promise<ReturnType<typeof buildFinancialReportPayload>> {
  const t = await getTranslations({ locale, namespace: 'financial.overview.detailedReport' });
  const tOverview = await getTranslations({ locale, namespace: 'financial.overview' });
  const tRec = await getTranslations({ locale, namespace: 'financial.overview.recognizedBreakdown' });
  const tCash = await getTranslations({ locale, namespace: 'financial.overview.cashPaidBreakdown' });

  const period = periodLabel(
    locale,
    overview.period.fromDate,
    overview.period.toDate,
    tOverview('printPeriod'),
  );

  const shortPayload = await buildFinancialOverviewPrintPayload(locale, companyName, overview);
  const executiveRows = shortPayload.sections.flatMap((section) => section.rows ?? []);

  const sections: ReportSection[] = [
    {
      id: 'executive',
      heading: t('executiveTitle'),
      rows: executiveRows,
    },
  ];

  const notices: string[] = [
    tOverview('pageHint'),
    t('scopeHint'),
    t('snapshotNotice'),
    t('upcomingWindowNotice'),
  ];

  const currency = overview.currency;

  if (detailed.recognized) {
    const lines = detailed.recognized.lines;
    if (!isZeroMoney(subtractMoney(detailed.recognized.totalNet, detailed.recognized.kpiNet))) {
      notices.push(tRec('parityWarning'));
    }

    sections.push({
      id: 'recognized-summary',
      heading: t('recognizedSummaryTitle'),
      rows: [
        { label: tRec('columnNet'), value: moneyCell(detailed.recognized.totalNet, locale) },
        { label: tRec('columnVat'), value: moneyCell(detailed.recognized.totalVat, locale) },
        { label: tRec('columnGross'), value: moneyCell(detailed.recognized.totalGross, locale) },
      ],
    });

    sections.push({
      id: 'recognized-lines',
      heading: headingWithCount(t('recognizedLinesTitle'), lines.length),
      tables: [
        {
          headers: [
            tRec('columnRecognitionDate'),
            tRec('columnSource'),
            tRec('columnParty'),
            tRec('columnDescription'),
            tRec('columnAllocation'),
            tRec('columnNet'),
            tRec('columnVat'),
            tRec('columnGross'),
          ],
          rows: lines.map((line) => [
            line.recognitionDate,
            tRec(`source.${line.sourceKind}`),
            line.party || '—',
            recognizedLineDescription(line, tRec as (key: string, values?: Record<string, string | number>) => string),
            recognizedAllocation(line, tRec as (key: string, values?: Record<string, string | number>) => string),
            moneyCell(line.net, locale),
            moneyCell(line.vat, locale),
            moneyCell(line.gross, locale),
          ]),
        },
      ],
    });

    const rollupHeaders = [t('rollupGroup'), t('rollupCount'), tRec('columnNet')];
    sections.push({
      id: 'recognized-rollup-party',
      heading: t('rollupByPartyTitle'),
      tables: [
        {
          headers: rollupHeaders,
          rows: rollupRecognizedNet(lines, currency, locale, (line) => line.party),
        },
      ],
    });
    sections.push({
      id: 'recognized-rollup-project',
      heading: t('rollupByProjectTitle'),
      tables: [
        {
          headers: rollupHeaders,
          rows: rollupRecognizedNet(
            lines,
            currency,
            locale,
            (line) => line.projectName ?? t('rollupUnassigned'),
          ),
        },
      ],
    });
    sections.push({
      id: 'recognized-rollup-source',
      heading: t('rollupBySourceTitle'),
      tables: [
        {
          headers: rollupHeaders,
          rows: rollupRecognizedNet(
            lines,
            currency,
            locale,
            (line) => tRec(`source.${line.sourceKind}`),
          ),
        },
      ],
    });

    const monthMap = new Map<string, MoneyValue>();
    for (const line of lines) {
      if (line.estimate || line.undatedApBill) continue;
      const ym = line.yearMonth;
      monthMap.set(ym, addMoney(monthMap.get(ym) ?? zeroMoney(currency), line.net));
    }
    if (monthMap.size > 0) {
      sections.push({
        id: 'recognized-by-month',
        heading: t('rollupByMonthTitle'),
        tables: [
          {
            headers: [t('rollupMonth'), tRec('columnNet')],
            rows: [...monthMap.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([ym, net]) => [ym, moneyCell(net, locale)]),
          },
        ],
      });
    }
  }

  if (detailed.cashPaid) {
    const paidLines = detailed.cashPaid.paidLines;
    const display = detailed.cashPaid.flow.display.paid;
    const sourceLabels: Record<MonthCashSource, string> = {
      payroll: tCash('source.payroll'),
      expense: tCash('source.expense'),
      ap: tCash('source.ap'),
      subcontract_advance: tCash('source.subcontract_advance'),
    };

    sections.push({
      id: 'cash-summary',
      heading: t('cashSummaryTitle'),
      rows: [
        { label: tCash('columnNet'), value: moneyCell(display.net, locale) },
        { label: tCash('columnVat'), value: moneyCell(display.vat, locale) },
        { label: tCash('columnGross'), value: moneyCell(display.gross, locale) },
      ],
    });

    sections.push({
      id: 'cash-lines',
      heading: headingWithCount(t('cashLinesTitle'), paidLines.length),
      tables: [
        {
          headers: [
            tCash('columnPaymentDate'),
            tCash('columnSource'),
            tCash('columnParty'),
            tCash('columnDocument'),
            tCash('columnNet'),
            tCash('columnVat'),
            tCash('columnGross'),
          ],
          rows: paidLines.map((line) => {
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
          }),
        },
      ],
    });

    const cashRollupHeaders = [t('rollupGroup'), t('rollupCount'), tCash('columnGross')];
    sections.push({
      id: 'cash-rollup-party',
      heading: t('rollupCashByPartyTitle'),
      tables: [
        {
          headers: cashRollupHeaders,
          rows: rollupCashGross(paidLines, currency, (line) => line.party, locale),
        },
      ],
    });
    sections.push({
      id: 'cash-rollup-source',
      heading: t('rollupCashBySourceTitle'),
      tables: [
        {
          headers: cashRollupHeaders,
          rows: rollupCashGross(paidLines, currency, (line) => sourceLabels[line.source], locale),
        },
      ],
    });

    const expected = detailed.cashPaid.flow.expectedLines;
    if (expected.length > 0) {
      sections.push({
        id: 'expected-cash',
        heading: headingWithCount(t('expectedCashTitle'), expected.length),
        tables: [expectedCashTable(expected, sourceLabels, locale, t, tCash('columnSource'))],
      });
    }
  }

  if (detailed.billingInPeriod.length > 0) {
    sections.push({
      id: 'billing-period',
      heading: headingWithCount(t('billingInPeriodTitle'), detailed.billingInPeriod.length),
      tables: [billingTable(detailed.billingInPeriod, locale, t)],
    });
  }

  if (detailed.collectionsInPeriod.length > 0) {
    sections.push({
      id: 'collections-period',
      heading: headingWithCount(t('collectionsInPeriodTitle'), detailed.collectionsInPeriod.length),
      tables: [collectionsTable(detailed.collectionsInPeriod, locale, t)],
    });
  }

  const openAr = detailed.billingSnapshot.filter((row) => isPositiveMoney(row.outstandingAmount));
  if (openAr.length > 0) {
    sections.push({
      id: 'open-receivables',
      heading: headingWithCount(t('openReceivablesTitle'), openAr.length),
      tables: [openArTable(openAr, locale, t)],
    });
  }

  if (detailed.apPayables) {
    const openBills = detailed.apPayables.bills.filter((bill) => {
      const outstanding = money(bill.outstanding, bill.currency);
      return isPositiveMoney(outstanding);
    });
    if (openBills.length > 0) {
      sections.push({
        id: 'open-ap',
        heading: headingWithCount(t('openApTitle'), openBills.length),
        tables: [
          {
            headers: [
              t('apVendor'),
              t('apReference'),
              t('apDueDate'),
              t('apOutstanding'),
            ],
            rows: openBills.map((bill) => [
              bill.vendorName ?? '—',
              bill.reference ?? '—',
              bill.dueDate ? formatBusinessDate(bill.dueDate, locale, 'short') : '—',
              moneyCell(money(bill.outstanding, bill.currency), locale),
            ]),
          },
        ],
      });
    }
  }

  if (detailed.projectRollup) {
    const commitmentRows = detailed.projectRollup.rows.filter(
      (row) => row.committedOpen != null && isPositiveMoney(row.committedOpen),
    );
    if (commitmentRows.length > 0) {
      sections.push({
        id: 'commitments-by-project',
        heading: headingWithCount(t('commitmentsByProjectTitle'), commitmentRows.length),
        tables: [
          {
            headers: [t('projectName'), t('commitmentOpen')],
            rows: commitmentRows.map((row) => [row.name, moneyCell(row.committedOpen!, locale)]),
          },
        ],
      });
    }
  }

  const horizon = addDays(detailed.today, 30);
  if (detailed.apPayables) {
    const upcomingAp = detailed.apPayables.bills.filter((bill) => {
      if (!bill.dueDate) return false;
      if (bill.dueDate < detailed.today || bill.dueDate > horizon) return false;
      const outstanding = money(bill.outstanding, bill.currency);
      return isPositiveMoney(outstanding);
    });
    if (upcomingAp.length > 0) {
      sections.push({
        id: 'upcoming-ap',
        heading: headingWithCount(t('upcomingApTitle'), upcomingAp.length),
        tables: [
          {
            headers: [t('apVendor'), t('apDueDate'), t('apOutstanding')],
            rows: upcomingAp.map((bill) => [
              bill.vendorName ?? '—',
              bill.dueDate ? formatBusinessDate(bill.dueDate, locale, 'short') : '—',
              moneyCell(money(bill.outstanding, bill.currency), locale),
            ]),
          },
        ],
      });
    }
  }

  return buildFinancialReportPayload({
    locale,
    title: t('pageTitle'),
    companyName,
    periodLabel: period,
    notices,
    sections,
  });
}

function billingTable(
  records: readonly BillingRecordSummary[],
  locale: string,
  t: (key: string) => string,
) {
  const currency = records[0]?.totalAmount.currency ?? 'ILS';
  return {
    headers: [
      t('billingIssueDate'),
      t('billingClient'),
      t('billingProject'),
      t('billingReference'),
      t('billingNet'),
      t('billingVat'),
      t('billingGross'),
    ],
    rows: records.map((row) => [
      formatBusinessDate(row.issueDate, locale, 'short'),
      row.clientName ?? '—',
      row.projectName ?? '—',
      row.reference ?? '—',
      moneyCell(billingNet(row), locale),
      moneyCell(billingVat(row, currency), locale),
      moneyCell(row.totalAmount, locale),
    ]),
  };
}

function collectionsTable(
  rows: readonly PaymentApplicationRow[],
  locale: string,
  t: (key: string) => string,
) {
  return {
    headers: [
      t('collectionDate'),
      t('collectionClient'),
      t('collectionProject'),
      t('billingReference'),
      t('collectionMethod'),
      t('collectionAmount'),
    ],
    rows: rows.map((row) => [
      formatBusinessDate(row.paymentDate, locale, 'short'),
      row.clientName ?? '—',
      row.projectName ?? '—',
      row.billingReference ?? '—',
      row.method ?? '—',
      moneyCell(row.amount, locale),
    ]),
  };
}

function openArTable(
  records: readonly BillingRecordSummary[],
  locale: string,
  t: (key: string) => string,
) {
  return {
    headers: [
      t('billingIssueDate'),
      t('billingDueDate'),
      t('billingClient'),
      t('billingReference'),
      t('openArOutstanding'),
    ],
    rows: records.map((row) => [
      formatBusinessDate(row.issueDate, locale, 'short'),
      row.dueDate ? formatBusinessDate(row.dueDate, locale, 'short') : '—',
      row.clientName ?? '—',
      row.reference ?? '—',
      moneyCell(row.outstandingAmount, locale),
    ]),
  };
}

function expectedCashTable(
  lines: readonly MonthCashExpectedLine[],
  sourceLabels: Record<MonthCashSource, string>,
  locale: string,
  t: (key: string) => string,
  sourceColumnLabel: string,
) {
  return {
    headers: [
      t('expectedDueDate'),
      sourceColumnLabel,
      t('expectedParty'),
      t('expectedRemaining'),
      t('expectedStatus'),
    ],
    rows: lines.map((line) => [
      formatBusinessDate(line.dueDate, locale, 'short'),
      sourceLabels[line.source],
      cashLineDisplayText(line.party) || '—',
      moneyCell(line.remaining, locale),
      line.status,
    ]),
  };
}
