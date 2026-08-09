import { addMoney, zeroMoney, type MoneyValue } from '@/shared/money';
import type { ProjectRollupRow } from '../application/get-organization-project-rollup';
import { moneyMetric, sumMoneyMetrics, type MoneyReportMetric } from './report-metric';

const FX_EXCL = 'foreignCurrencyProjects' as const;
const VAT_EXCL = 'vatNotProfit' as const;

export interface OrgCommercialTotals {
  readonly original: MoneyReportMetric;
  readonly approvedAdditions: MoneyReportMetric;
  readonly approvedReductions: MoneyReportMetric;
  readonly current: MoneyReportMetric;
  readonly pending: MoneyReportMetric;
}

export interface OrgCashTotals {
  readonly invoiced: MoneyReportMetric;
  readonly paid: MoneyReportMetric;
  readonly outstanding: MoneyReportMetric;
}

export interface OrgCostTotals {
  readonly actual: MoneyReportMetric;
  readonly labor: MoneyReportMetric;
  readonly vendors: MoneyReportMetric;
  readonly overhead: MoneyReportMetric;
  readonly committed: MoneyReportMetric;
  readonly openAp: MoneyReportMetric;
  readonly estimatedFinal: MoneyReportMetric;
}

export interface OrgProfitTotals {
  readonly estimatedProfit: MoneyReportMetric;
  /** Null when no projects have a margin (zero contract). */
  readonly sampleMarginPercent: string | null;
}

function sumField(
  rows: readonly ProjectRollupRow[],
  currency: string,
  pick: (row: ProjectRollupRow) => MoneyValue | null,
): MoneyValue {
  return sumMoneyMetrics(
    rows.map((row) => pick(row)),
    currency,
  );
}

/**
 * Org commercial rollup from base-currency project rows only.
 * Pending changes are never folded into current contract.
 */
export function aggregateOrgCommercial(
  rows: readonly ProjectRollupRow[],
  currency: string,
): OrgCommercialTotals {
  const fx = [FX_EXCL];
  return {
    original: moneyMetric({
      key: 'originalContract',
      kind: 'commercial',
      value: sumField(rows, currency, (r) => r.originalContract),
      inclusions: ['primaryContractsBaseCurrency'],
      exclusions: [...fx, 'pendingChanges'],
    }),
    approvedAdditions: moneyMetric({
      key: 'approvedAdditions',
      kind: 'commercial',
      value: sumField(rows, currency, (r) => r.approvedAdditions),
      inclusions: ['approvedChangeOrders'],
      exclusions: [...fx, 'pendingChanges', 'billing'],
    }),
    approvedReductions: moneyMetric({
      key: 'approvedReductions',
      kind: 'commercial',
      value: sumField(rows, currency, (r) => r.approvedReductions),
      inclusions: ['approvedChangeOrders'],
      exclusions: [...fx, 'pendingChanges', 'billing'],
    }),
    current: moneyMetric({
      key: 'currentContract',
      kind: 'commercial',
      value: sumField(rows, currency, (r) => r.currentContract),
      inclusions: ['originalPlusApprovedChanges'],
      exclusions: [...fx, 'pendingChanges', 'invoiced', 'paid'],
    }),
    pending: moneyMetric({
      key: 'pendingChanges',
      kind: 'commercial',
      value: sumField(rows, currency, (r) => r.pendingChanges),
      inclusions: ['pricedAwaitingApproval'],
      exclusions: [...fx, 'currentContract'],
    }),
  };
}

/** Billing cash position — Contract ≠ Billing ≠ Payment. */
export function aggregateOrgCash(
  rows: readonly ProjectRollupRow[],
  currency: string,
): OrgCashTotals {
  const fx = [FX_EXCL];
  return {
    invoiced: moneyMetric({
      key: 'invoiced',
      kind: 'actual',
      value: sumField(rows, currency, (r) => r.invoiced),
      inclusions: ['finalizedBilling'],
      exclusions: [...fx, 'contractValue', 'pendingChanges'],
    }),
    paid: moneyMetric({
      key: 'paid',
      kind: 'actual',
      value: sumField(rows, currency, (r) => r.paid),
      inclusions: ['recordedPayments'],
      exclusions: [...fx, 'outstanding', 'forecastIncoming'],
    }),
    outstanding: moneyMetric({
      key: 'outstanding',
      kind: 'actual',
      value: sumField(rows, currency, (r) => r.outstanding),
      inclusions: ['invoicedMinusPaid'],
      exclusions: [...fx, 'contractValue', VAT_EXCL],
    }),
  };
}

/**
 * Cost rollup. Committed and AP stay beside Actual — never summed into it.
 * Estimated final is estimate (V1 often equals actual when no remaining inputs).
 */
export function aggregateOrgCost(
  rows: readonly ProjectRollupRow[],
  currency: string,
): OrgCostTotals {
  const fx = [FX_EXCL];
  return {
    actual: moneyMetric({
      key: 'actualCost',
      kind: 'actual',
      value: sumField(rows, currency, (r) => r.actualCost),
      inclusions: ['expensesAndLaborEntered'],
      exclusions: [...fx, 'committedPo', 'openAp', 'vatAsCost'],
    }),
    labor: moneyMetric({
      key: 'laborActual',
      kind: 'actual',
      value: sumField(rows, currency, (r) => r.laborActual),
      inclusions: ['workforceCostedEntries'],
      exclusions: [...fx, 'entriesMissingRate'],
    }),
    vendors: moneyMetric({
      key: 'vendorActual',
      kind: 'actual',
      value: sumField(rows, currency, (r) => r.vendorActual),
      inclusions: ['subcontractorExpenses'],
      exclusions: [...fx, 'committedPo'],
    }),
    overhead: moneyMetric({
      key: 'overheadActual',
      kind: 'actual',
      value: sumField(rows, currency, (r) => r.overheadActual),
      inclusions: ['businessOverheadFamily'],
      exclusions: [...fx],
    }),
    committed: moneyMetric({
      key: 'committedOpen',
      kind: 'committed',
      value: sumField(rows, currency, (r) => r.committedOpen),
      inclusions: ['openPurchaseOrderCommitments'],
      exclusions: [...fx, 'expenseActual', 'matchedAp'],
    }),
    openAp: moneyMetric({
      key: 'openApPayable',
      kind: 'forecast',
      value: sumField(rows, currency, (r) => r.openApPayable),
      inclusions: ['unmatchedOpenApBills'],
      exclusions: [...fx, 'expenseActual', 'committedPo'],
    }),
    estimatedFinal: moneyMetric({
      key: 'estimatedFinalCost',
      kind: 'estimate',
      value: sumField(rows, currency, (r) => r.estimatedFinalCost),
      inclusions: ['actualPlusEnteredRemaining'],
      exclusions: [...fx, 'committedPo', 'openAp'],
    }),
  };
}

/** Profit = current contract − estimated final. VAT never treated as profit. */
export function aggregateOrgProfit(
  rows: readonly ProjectRollupRow[],
  currency: string,
): OrgProfitTotals {
  const estimatedProfit = moneyMetric({
    key: 'estimatedProfit',
    kind: 'estimate',
    value: sumField(rows, currency, (r) => r.estimatedProfit),
    inclusions: ['currentContractMinusEstimatedFinal'],
    exclusions: [FX_EXCL, VAT_EXCL, 'incompleteCostCoverage'],
  });

  const withMargin = rows.find((row) => row.marginPercent != null);
  return {
    estimatedProfit,
    sampleMarginPercent: withMargin?.marginPercent ?? null,
  };
}

/** Sum of asset_capital family is surfaced as asset cost exposure (Actual expense). */
export function sumAssetCapitalActual(
  values: readonly MoneyValue[],
  currency: string,
): MoneyValue {
  return values.reduce((acc, value) => {
    if (value.currency.toUpperCase() !== currency.toUpperCase()) return acc;
    return addMoney(acc, value);
  }, zeroMoney(currency));
}
