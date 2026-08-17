/**
 * Owner-level management analytics from existing financial rollup / cash / CRM.
 * Uncovered metrics stay null. No invented charts or numbers.
 */

import {
  addMoney,
  compareMoney,
  isZeroMoney,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { ProjectRollupRow } from '../application/get-organization-project-rollup';
import type { CashFlowOutlook } from './cash-flow';

export interface NamedMoneyRow {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly amount: MoneyValue;
}

export interface QuotesConversionMetric {
  readonly pipelineCount: number;
  readonly convertedCount: number;
  readonly ratePercent: string;
  readonly href: string;
}

export interface OpportunityConversionMetric {
  readonly decidedCount: number;
  readonly wonCount: number;
  readonly ratePercent: string;
  readonly href: string;
}

export interface VendorConcentrationMetric {
  readonly vendorCount: number;
  readonly topVendorId: string | null;
  readonly topVendorName: string | null;
  readonly topVendorAmount: MoneyValue;
  readonly topVendorSharePercent: string;
  readonly href: string;
}

export interface WorkforceHoursMetric {
  readonly recordedHours: string;
  readonly employeeCount: number;
  /** Null until scheduled capacity exists - do not invent an 8-hour day. */
  readonly utilizationPercent: string | null;
  readonly href: string;
}

export interface ProjectRiskRow {
  readonly projectId: string;
  readonly name: string;
  readonly href: string;
  readonly warningCount: number;
  readonly highestClass: 'confirmed' | 'projected' | 'missing_data';
}

export interface ManagementAnalytics {
  readonly activeProjectValue: MoneyValue | null;
  readonly unbilledBacklog: MoneyValue | null;
  readonly totalActualCost: MoneyValue | null;
  readonly totalCommitments: MoneyValue | null;
  readonly expectedProfit: MoneyValue | null;
  readonly clientOutstanding: MoneyValue | null;
  readonly vendorOutstanding: MoneyValue | null;
  readonly cashExpectedIn: MoneyValue | null;
  readonly cashExpectedOut: MoneyValue | null;
  readonly quotesConversion: QuotesConversionMetric | null;
  readonly opportunityConversion: OpportunityConversionMetric | null;
  readonly profitByProject: readonly NamedMoneyRow[] | null;
  readonly profitByClient: readonly NamedMoneyRow[] | null;
  readonly profitByWorkType: readonly NamedMoneyRow[] | null;
  readonly projectsAtRisk: readonly ProjectRiskRow[] | null;
  readonly workforceHours: WorkforceHoursMetric | null;
  readonly vendorConcentration: VendorConcentrationMetric | null;
}

export function computeUnbilledBacklog(
  currentContract: MoneyValue | null | undefined,
  invoiced: MoneyValue | null | undefined,
): MoneyValue | null {
  if (!currentContract || !invoiced) return null;
  if (currentContract.currency.toUpperCase() !== invoiced.currency.toUpperCase()) return null;
  if (isZeroMoney(currentContract) && isZeroMoney(invoiced)) return null;
  if (compareMoney(invoiced, currentContract) > 0) return null;
  return subtractMoney(currentContract, invoiced);
}

export function computeQuotesConversion(
  quotes: readonly { status: string }[],
): Omit<QuotesConversionMetric, 'href'> | null {
  if (quotes.length === 0) return null;
  const pipeline = quotes.filter((quote) =>
    ['sent', 'accepted', 'rejected', 'expired', 'converted'].includes(quote.status),
  );
  if (pipeline.length === 0) return null;
  const convertedCount = pipeline.filter((quote) => quote.status === 'converted').length;
  return {
    pipelineCount: pipeline.length,
    convertedCount,
    ratePercent: ((convertedCount / pipeline.length) * 100).toFixed(1),
  };
}

export function computeOpportunityConversion(
  opportunities: readonly { status: string }[],
): Omit<OpportunityConversionMetric, 'href'> | null {
  if (opportunities.length === 0) return null;
  const decided = opportunities.filter(
    (row) => row.status === 'won' || row.status === 'lost',
  );
  if (decided.length === 0) return null;
  const wonCount = decided.filter((row) => row.status === 'won').length;
  return {
    decidedCount: decided.length,
    wonCount,
    ratePercent: ((wonCount / decided.length) * 100).toFixed(1),
  };
}

export function computeVendorConcentration(
  amounts: readonly { vendorId: string; vendorName: string | null; amount: MoneyValue }[],
  currency: string,
): Omit<VendorConcentrationMetric, 'href'> | null {
  if (amounts.length === 0) return null;
  const byVendor = new Map<string, { name: string | null; total: MoneyValue }>();
  let grand = zeroMoney(currency);
  for (const row of amounts) {
    if (row.amount.currency.toUpperCase() !== currency.toUpperCase()) continue;
    if (isZeroMoney(row.amount)) continue;
    grand = addMoney(grand, row.amount);
    const current = byVendor.get(row.vendorId);
    if (current) {
      byVendor.set(row.vendorId, {
        name: current.name ?? row.vendorName,
        total: addMoney(current.total, row.amount),
      });
    } else {
      byVendor.set(row.vendorId, { name: row.vendorName, total: row.amount });
    }
  }
  if (byVendor.size === 0 || isZeroMoney(grand)) return null;

  let topVendorId: string | null = null;
  let topVendorName: string | null = null;
  let topVendorAmount = zeroMoney(currency);
  for (const [vendorId, value] of byVendor) {
    if (compareMoney(value.total, topVendorAmount) > 0) {
      topVendorId = vendorId;
      topVendorName = value.name;
      topVendorAmount = value.total;
    }
  }

  const share = Number(topVendorAmount.amount) / Number(grand.amount);
  return {
    vendorCount: byVendor.size,
    topVendorId,
    topVendorName,
    topVendorAmount,
    topVendorSharePercent: (share * 100).toFixed(1),
  };
}

export function groupProfitByProject(
  rows: readonly ProjectRollupRow[],
): NamedMoneyRow[] | null {
  const grouped = rows
    .filter((row) => row.actualProfit != null)
    .map((row) => ({
      id: row.projectId,
      label: row.name,
      href: `/projects/${row.projectId}/financials`,
      amount: row.actualProfit!,
    }));
  return grouped.length > 0 ? grouped : null;
}

export function groupProfitByWorkType(
  rows: readonly ProjectRollupRow[],
  currency: string,
): NamedMoneyRow[] | null {
  const byKind = new Map<string, MoneyValue>();
  for (const row of rows) {
    if (!row.actualProfit) continue;
    if (row.actualProfit.currency.toUpperCase() !== currency.toUpperCase()) continue;
    const current = byKind.get(row.workKind) ?? zeroMoney(currency);
    byKind.set(row.workKind, addMoney(current, row.actualProfit));
  }
  if (byKind.size === 0) return null;
  return [...byKind.entries()].map(([workKind, amount]) => ({
    id: workKind,
    label: workKind,
    href: `/reports?workKind=${encodeURIComponent(workKind)}&section=profitability`,
    amount,
  }));
}

export function groupProfitByClient(
  rows: readonly {
    clientId: string | null;
    clientName: string | null;
    actualProfit: MoneyValue | null;
  }[],
  currency: string,
): NamedMoneyRow[] | null {
  const byClient = new Map<string, { name: string; amount: MoneyValue }>();
  for (const row of rows) {
    if (!row.actualProfit || !row.clientId) continue;
    if (row.actualProfit.currency.toUpperCase() !== currency.toUpperCase()) continue;
    const current = byClient.get(row.clientId);
    if (current) {
      byClient.set(row.clientId, {
        name: current.name,
        amount: addMoney(current.amount, row.actualProfit),
      });
    } else {
      byClient.set(row.clientId, {
        name: row.clientName?.trim() || row.clientId,
        amount: row.actualProfit,
      });
    }
  }
  if (byClient.size === 0) return null;
  return [...byClient.entries()].map(([id, value]) => ({
    id,
    label: value.name,
    href: `/clients/${id}`,
    amount: value.amount,
  }));
}

export function timedCashFromOutlook(
  outlook: CashFlowOutlook | null,
  direction: 'in' | 'out',
): MoneyValue | null {
  if (!outlook) return null;
  if (direction === 'in') {
    let total = zeroMoney(outlook.currency);
    for (const bucket of outlook.forecastBuckets) {
      if (bucket.key === 'undated') continue;
      total = addMoney(total, bucket.expectedIn);
    }
    return total;
  }
  if (!outlook.outgoing.available) return null;
  let total = zeroMoney(outlook.currency);
  for (const bucket of outlook.outgoing.forecastBuckets) {
    if (bucket.key === 'undated') continue;
    total = addMoney(total, bucket.expectedOut);
  }
  return total;
}

export function emptyManagementAnalytics(): ManagementAnalytics {
  return {
    activeProjectValue: null,
    unbilledBacklog: null,
    totalActualCost: null,
    totalCommitments: null,
    expectedProfit: null,
    clientOutstanding: null,
    vendorOutstanding: null,
    cashExpectedIn: null,
    cashExpectedOut: null,
    quotesConversion: null,
    opportunityConversion: null,
    profitByProject: null,
    profitByClient: null,
    profitByWorkType: null,
    projectsAtRisk: null,
    workforceHours: null,
    vendorConcentration: null,
  };
}
