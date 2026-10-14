import 'server-only';

import { listBillingRecords, listPaymentApplications } from '@/modules/billing';
import type { BillingRecordSummary, PaymentApplicationRow } from '@/modules/billing/domain/types';
import {
  isForeignCurrencyRow,
  mapBillingSummaryToYearBookRow,
  mapPaymentApplicationToYearBookReceipt,
} from '../domain/financial-year-book/billing-mapping';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate, endOfMonth, todayInTimeZone } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  addMoney,
  isZeroMoney,
  money,
  roundMoney,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import {
  sumCollectionTripletsInDateRange,
  sumInvoicedInDateRange,
} from '../data/billing.repository';
import {
  listOrganizationRecognizedCostBreakdownInDateRange,
  sumOrganizationRecognizedCostPairInDateRange,
  type RecognizedCostBreakdownLine,
} from '../data/expenses.repository';
import type { MonthCashExpectedLine, MonthCashPaidLine } from '../domain/month-cash-flow';
import { sanitizeBusinessText } from '../domain/financial-year-book/format';
import {
  isDateInInclusiveRange,
  resolveYearBookMonths,
  type YearBookMonthPeriod,
} from '../domain/financial-year-book/periods';
import type {
  FinancialYearBookData,
  YearBookBillingRow,
  YearBookEmployerCostRow,
  YearBookMonthData,
  YearBookMonthSummary,
  YearBookOverheadSlice,
  YearBookOverviewRow,
  YearBookPaymentRow,
  YearBookRecognizedCostRow,
} from '../domain/financial-year-book/types';
import {
  composeMonthCashFlowFromBundle,
  loadMonthCashFlowBundle,
  type MonthCashFlowBundle,
} from './get-month-cash-flow';

function zeroVat(currency: string): MoneyValue {
  return zeroMoney(currency);
}

function tripletFromPaidLine(line: MonthCashPaidLine): {
  net: MoneyValue;
  vat: MoneyValue;
  gross: MoneyValue;
} {
  const currency = line.amount.currency;
  if (line.display) {
    return {
      net: money(line.display.net.amount, currency),
      vat: money(line.display.vat.amount, currency),
      gross: money(line.display.gross.amount, currency),
    };
  }
  return {
    net: line.amount,
    vat: zeroVat(currency),
    gross: line.amount,
  };
}

function tripletFromExpected(line: MonthCashExpectedLine): {
  net: MoneyValue;
  vat: MoneyValue;
  gross: MoneyValue;
} {
  const currency = line.remaining.currency;
  if (line.display) {
    return {
      net: money(line.display.net.amount, currency),
      vat: money(line.display.vat.amount, currency),
      gross: money(line.display.gross.amount, currency),
    };
  }
  return {
    net: line.remaining,
    vat: zeroVat(currency),
    gross: line.remaining,
  };
}

function paidLineToPaymentRow(
  line: MonthCashPaidLine,
  nature: 'actual' | 'expected',
): YearBookPaymentRow {
  const split = tripletFromPaidLine(line);
  const sourceLabel =
    line.source === 'ap'
      ? 'תשלום ספק'
      : line.source === 'payroll'
        ? 'תשלום שכר'
        : line.source === 'subcontract_advance'
          ? 'מקדמה'
          : 'תשלום הוצאה';
  return {
    date: line.paymentDate,
    party: sanitizeBusinessText(line.party),
    description: sanitizeBusinessText(`${sourceLabel}${line.document ? ` — ${line.document}` : ''}`),
    project: sanitizeBusinessText(line.reference ?? ''),
    net: split.net,
    vat: split.vat,
    gross: split.gross,
    nature,
  };
}

function expectedLineToPaymentRow(line: MonthCashExpectedLine): YearBookPaymentRow {
  const split = tripletFromExpected(line);
  return {
    date: line.dueDate,
    party: sanitizeBusinessText(line.party),
    description: sanitizeBusinessText(line.document || 'התחייבות צפויה'),
    project: '',
    net: split.net,
    vat: split.vat,
    gross: split.gross,
    nature: 'expected',
  };
}

function recognizedLineCategory(line: RecognizedCostBreakdownLine): string {
  if (line.sourceKind === 'employer_cost') return 'עלות מעסיק';
  if (line.sourceKind === 'ap_bill') return 'חשבונית ספק';
  if (line.projectName) return 'עלות לפרויקט';
  switch (line.costFamily) {
    case 'business_overhead':
      return 'תקורה — חברה';
    case 'shared':
      return 'עלות משותפת';
    case 'asset_capital':
      return 'נכס / הון';
    default:
      return 'לא משויך';
  }
}

function mapRecognizedLine(line: RecognizedCostBreakdownLine): YearBookRecognizedCostRow {
  return {
    date: line.recognitionDate,
    party: sanitizeBusinessText(line.party),
    description: sanitizeBusinessText(line.description),
    project: sanitizeBusinessText(line.projectName ?? ''),
    net: line.net,
    vat: line.vat,
    gross: line.gross,
    category: recognizedLineCategory(line),
  };
}

function buildOverheadSlices(
  lines: readonly RecognizedCostBreakdownLine[],
  currency: string,
): YearBookOverheadSlice[] {
  const buckets = new Map<string, MoneyValue>();
  for (const line of lines) {
    if (line.sourceKind !== 'expense' && line.sourceKind !== 'ap_bill') continue;
    const key = recognizedLineCategory(line);
    const prev = buckets.get(key) ?? zeroMoney(currency);
    buckets.set(key, roundMoney(addMoney(prev, line.net)));
  }
  return [...buckets.entries()].map(([label, net]) => ({ label, net }));
}

const YEAR_BOOK_ROW_CAP = 5_000;

async function listAllPaymentApplications(context: OrgContext): Promise<{
  readonly rows: readonly PaymentApplicationRow[];
  readonly truncated: boolean;
}> {
  const pageSize = 200;
  const all: PaymentApplicationRow[] = [];
  let truncated = false;
  for (let offset = 0; ; offset += pageSize) {
    const batch = await listPaymentApplications(context, { limit: pageSize, offset });
    all.push(...batch);
    if (batch.length < pageSize) break;
    if (all.length >= YEAR_BOOK_ROW_CAP) {
      truncated = true;
      break;
    }
  }
  return {
    rows: all.filter((row) => row.status !== 'void'),
    truncated,
  };
}

async function listAllBillingRecords(context: OrgContext): Promise<{
  readonly rows: readonly BillingRecordSummary[];
  readonly truncated: boolean;
}> {
  const pageSize = 200;
  const all: BillingRecordSummary[] = [];
  let truncated = false;
  for (let offset = 0; ; offset += pageSize) {
    const batch = await listBillingRecords(context, { filter: 'all', limit: pageSize, offset });
    all.push(...batch);
    if (batch.length < pageSize) break;
    if (all.length >= YEAR_BOOK_ROW_CAP) {
      truncated = true;
      break;
    }
  }
  return { rows: all, truncated };
}

function countFxExcludedRows(
  billingRows: readonly BillingRecordSummary[],
  paymentApps: readonly PaymentApplicationRow[],
  bookCurrency: string,
): number {
  let count = 0;
  for (const row of billingRows) {
    if (isForeignCurrencyRow(row.totalAmount.currency, bookCurrency)) count += 1;
  }
  for (const row of paymentApps) {
    if (isForeignCurrencyRow(row.amount.currency, bookCurrency)) count += 1;
  }
  return count;
}

async function buildMonthData(
  context: OrgContext,
  period: YearBookMonthPeriod,
  currency: string,
  recognizedByMonth: ReadonlyMap<string, readonly RecognizedCostBreakdownLine[]>,
  paymentApps: readonly PaymentApplicationRow[],
  billingRows: readonly BillingRecordSummary[],
  canReadBilling: boolean,
  cashFlowBundle: MonthCashFlowBundle,
): Promise<YearBookMonthData> {
  const monthEnd = endOfMonth(businessDate(`${period.yearMonth}-01`));
  const rangeTo = period.phase === 'partial' ? period.to : monthEnd;

  const collectionTriplet = canReadBilling
    ? await sumCollectionTripletsInDateRange(
        context.db,
        context.organizationId,
        currency,
        period.from,
        rangeTo,
      )
    : null;

  const recognizedPair = await sumOrganizationRecognizedCostPairInDateRange(
    context.db,
    context.organizationId,
    currency,
    period.from,
    rangeTo,
  );
  const netInvoiced = canReadBilling
    ? await sumInvoicedInDateRange(context.db, context.organizationId, currency, period.from, rangeTo)
    : null;
  const cashFlow = composeMonthCashFlowFromBundle(cashFlowBundle, {
    from: period.from,
    to: rangeTo,
    collectionsActual: collectionTriplet?.gross ?? zeroMoney(currency),
    collectionsDisplay: collectionTriplet ?? undefined,
  });

  const recognizedLines = (recognizedByMonth.get(period.yearMonth) ?? []).filter((line) => {
    if (line.sourceKind === 'employer_cost') return false;
    if (period.phase === 'future') return false;
    return isDateInInclusiveRange(line.recognitionDate, period.from, rangeTo);
  });

  const employerLines = (recognizedByMonth.get(period.yearMonth) ?? []).filter(
    (line) => line.sourceKind === 'employer_cost',
  );

  const paidExpenseAp = cashFlow.paidLines
    .filter((line) => line.source !== 'payroll')
    .map((line) => paidLineToPaymentRow(line, 'actual'));

  const payrollCash = cashFlow.paidLines
    .filter((line) => line.source === 'payroll')
    .map((line) => paidLineToPaymentRow(line, 'actual'));

  let commitments: YearBookPaymentRow[] = [];
  if (period.phase === 'partial' || period.phase === 'future') {
    commitments = cashFlow.expectedLines.map(expectedLineToPaymentRow);
  } else {
    commitments = cashFlow.expectedLines
      .filter((line) => isDateInInclusiveRange(line.dueDate, period.from, monthEnd))
      .map(expectedLineToPaymentRow);
  }

  const receiptNature = period.phase === 'future' ? 'expected' : 'actual';
  const receipts = canReadBilling
    ? paymentApps
        .filter((row) => isDateInInclusiveRange(row.paymentDate, period.from, rangeTo))
        .map((row) => mapPaymentApplicationToYearBookReceipt(row, currency, receiptNature).row)
        .filter((row): row is NonNullable<typeof row> => row !== null)
    : [];

  const billings: YearBookBillingRow[] = [];
  if (canReadBilling) {
    for (const summary of billingRows) {
      const issue = summary.issueDate;
      const inPeriod =
        period.phase === 'future'
          ? issue >= period.from && issue <= monthEnd
          : isDateInInclusiveRange(issue, period.from, rangeTo);
      if (!inPeriod) continue;
      const mapped = mapBillingSummaryToYearBookRow(summary, currency);
      if (mapped.row) billings.push(mapped.row);
    }
  }

  const employerCostNet = employerLines
    .filter((line) => !line.estimate)
    .reduce((sum, line) => addMoney(sum, line.net), zeroMoney(currency));

  const employerCosts: YearBookEmployerCostRow[] = employerLines.map((line) => ({
    yearMonth: line.yearMonth,
    employee: sanitizeBusinessText(line.party),
    project: sanitizeBusinessText(line.projectName ?? 'עלות חברה'),
    net: line.net,
    nature: line.estimate ? 'estimate' : 'final',
  }));

  const operationalProfitNet =
    netInvoiced && recognizedPair
      ? roundMoney(subtractMoney(netInvoiced, recognizedPair.net))
      : null;

  const summary: YearBookMonthSummary = {
    netInvoiced,
    grossCollected: collectionTriplet?.gross ?? null,
    recognizedCostNet: recognizedPair?.net ?? null,
    recognizedCostVat: recognizedPair
      ? roundMoney(subtractMoney(recognizedPair.gross, recognizedPair.net))
      : null,
    cashPaidGross: cashFlow.paidActual,
    employerCostNet: isZeroMoney(employerCostNet) ? null : roundMoney(employerCostNet),
    expectedCommitmentsGross: cashFlow.expectedOutgoing,
    netCashActual: cashFlow.netCash,
    operationalProfitNet,
  };

  return {
    period,
    payments: period.phase === 'future' ? [] : paidExpenseAp,
    receipts,
    recognizedCosts: period.phase === 'future' ? [] : recognizedLines.map(mapRecognizedLine),
    employerCosts: period.phase === 'future' ? [] : employerCosts,
    payrollCash: period.phase === 'future' ? [] : payrollCash,
    overhead: period.phase === 'future' ? [] : buildOverheadSlices(recognizedLines, currency),
    billings,
    commitments,
    summary,
    cashFlow,
  };
}

export async function loadFinancialYearBookData(
  context: OrgContext,
  year: number,
): Promise<FinancialYearBookData> {
  const currency = context.organization.baseCurrency.toUpperCase();
  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const timezone = context.organization.timezone;
  const today = todayInTimeZone(timezone);
  const yearStart = businessDate(`${year}-01-01`);
  const yearEnd = businessDate(`${year}-12-31`);
  const effectiveYearEnd = yearEnd > today ? today : yearEnd;

  const months = resolveYearBookMonths(year, timezone);

  const cashFlowBundle = await loadMonthCashFlowBundle(context, { from: yearStart, to: yearEnd });

  const recognizedLines = await listOrganizationRecognizedCostBreakdownInDateRange(
    context.db,
    context.organizationId,
    currency,
    yearStart,
    effectiveYearEnd,
  );
  const billingLoad = canReadBilling
    ? await listAllBillingRecords(context)
    : { rows: [], truncated: false };
  const paymentLoad = canReadBilling
    ? await listAllPaymentApplications(context)
    : { rows: [], truncated: false };
  const billingRows = billingLoad.rows;
  const paymentApps = paymentLoad.rows;
  const fxExcludedCount = canReadBilling
    ? countFxExcludedRows(billingRows, paymentApps, currency)
    : 0;

  const recognizedByMonth = new Map<string, RecognizedCostBreakdownLine[]>();
  for (const line of recognizedLines) {
    const bucket = recognizedByMonth.get(line.yearMonth) ?? [];
    bucket.push(line);
    recognizedByMonth.set(line.yearMonth, bucket);
  }

  const monthData: YearBookMonthData[] = [];
  for (const period of months) {
    monthData.push(
      await buildMonthData(
        context,
        period,
        currency,
        recognizedByMonth,
        paymentApps,
        billingRows,
        canReadBilling,
        cashFlowBundle,
      ),
    );
  }

  const overview: YearBookOverviewRow[] = monthData.map((month) => ({
    monthLabel: month.period.sheetTitle.slice(3),
    recognizedNet: month.summary.recognizedCostNet
      ? Number(month.summary.recognizedCostNet.amount)
      : null,
    cashPaidGross: month.summary.cashPaidGross ? Number(month.summary.cashPaidGross.amount) : null,
    employerNet: month.summary.employerCostNet ? Number(month.summary.employerCostNet.amount) : null,
    netInvoiced: month.summary.netInvoiced ? Number(month.summary.netInvoiced.amount) : null,
    grossCollected: month.summary.grossCollected ? Number(month.summary.grossCollected.amount) : null,
    paymentCount: month.payments.length + month.payrollCash.length,
    receiptCount: month.receipts.length,
  }));

  return {
    year,
    organizationName: sanitizeBusinessText(context.organization.name),
    currency,
    generatedAt: today,
    canReadBilling,
    fxExcludedCount,
    billingRecordsTruncated: billingLoad.truncated,
    paymentApplicationsTruncated: paymentLoad.truncated,
    months: monthData,
    overview,
  };
}
