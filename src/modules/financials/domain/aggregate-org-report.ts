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
  /** Null when every rollup row withheld Actual (permission / incomplete KPI). */
  readonly actual: MoneyReportMetric | null;
  readonly labor: MoneyReportMetric | null;
  readonly vendors: MoneyReportMetric | null;
  /** Allocated overhead that landed on projects (not unallocated business costs). */
  readonly overhead: MoneyReportMetric | null;
  readonly committed: MoneyReportMetric | null;
  readonly expectedRemaining: MoneyReportMetric | null;
  readonly openAp: MoneyReportMetric | null;
  readonly estimatedFinal: MoneyReportMetric | null;
  /**
   * Finalized org/shared/overhead NET not yet allocated to any project.
   * Null when the caller did not supply an unallocated total.
   * Never folded into `actual` / project profit.
   */
  readonly unallocatedBusinessCosts: MoneyReportMetric | null;
}

export interface OrgProfitTotals {
  /** Forecast margin: Σ (current contract − forecast final cost). Null when withheld. */
  readonly estimatedProfit: MoneyReportMetric | null;
  /** Actual margin: Σ (current contract − actual project cost). Null when withheld. */
  readonly actualProfit: MoneyReportMetric | null;
  /** Null when no projects have a margin (zero contract). */
  readonly sampleMarginPercent: string | null;
  readonly sampleActualMarginPercent: string | null;
}

/**
 * Sum row money for cost/profit KPIs.
 * When every pick is null (permission-denied / incomplete KPI), return null —
 * never a confident zero Actual from an empty contribution set (N-002).
 */
function sumFieldOrNull(
  rows: readonly ProjectRollupRow[],
  currency: string,
  pick: (row: ProjectRollupRow) => MoneyValue | null,
): MoneyValue | null {
  const values = rows.map((row) => pick(row));
  if (values.every((value) => value == null)) return null;
  return sumMoneyMetrics(values, currency);
}

/** Commercial/cash: absent fields contribute nothing; empty set is zeroMoney. */
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

function moneyMetricFromSum(input: {
  readonly key: string;
  readonly kind: Parameters<typeof moneyMetric>[0]['kind'];
  readonly value: MoneyValue | null;
  readonly inclusions?: readonly string[];
  readonly exclusions?: readonly string[];
}): MoneyReportMetric | null {
  if (input.value == null) return null;
  return moneyMetric({
    key: input.key,
    kind: input.kind,
    value: input.value,
    inclusions: input.inclusions,
    exclusions: input.exclusions,
  });
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

/** Billing cash position - Contract ≠ Billing ≠ Payment. */
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

export interface AggregateOrgCostOptions {
  /**
   * Unallocated business costs / costs awaiting allocation.
   * Surfaced beside project Actual - never added into project profit.
   */
  readonly unallocatedBusinessCosts?: MoneyValue | null;
}

/**
 * Cost rollup. Committed stays beside Actual - never summed into it.
 * Estimated Final Cost (Forecast Final Cost) = Actual + Remaining Commitments + ETC.
 * Open AP payable / vendor payments are cash disclosure only - never folded into estimatedFinal.
 * Actual includes recognized (posted) vendor bills from project financials.
 * Unallocated org costs are disclosed separately when provided.
 */
export function aggregateOrgCost(
  rows: readonly ProjectRollupRow[],
  currency: string,
  options: AggregateOrgCostOptions = {},
): OrgCostTotals {
  const fx = [FX_EXCL];
  const unallocatedValue = options.unallocatedBusinessCosts ?? null;
  return {
    actual: moneyMetricFromSum({
      key: 'actualCost',
      kind: 'actual',
      value: sumFieldOrNull(rows, currency, (r) => r.actualCost),
      inclusions: ['expensesAndLaborEntered', 'recognizedVendorBills'],
      exclusions: [
        ...fx,
        'committedPo',
        'openAp',
        'vendorPayments',
        'vatAsCost',
        'unallocatedBusinessCosts',
      ],
    }),
    labor: moneyMetricFromSum({
      key: 'laborActual',
      kind: 'actual',
      value: sumFieldOrNull(rows, currency, (r) => r.laborActual),
      inclusions: ['workforceCostedEntries'],
      exclusions: [...fx, 'entriesMissingRate'],
    }),
    vendors: moneyMetricFromSum({
      key: 'vendorActual',
      kind: 'actual',
      value: sumFieldOrNull(rows, currency, (r) => r.vendorActual),
      inclusions: ['subcontractorExpenses', 'recognizedVendorBills'],
      exclusions: [...fx, 'committedPo', 'vendorPayments'],
    }),
    overhead: moneyMetricFromSum({
      key: 'overheadActual',
      kind: 'actual',
      value: sumFieldOrNull(rows, currency, (r) => r.overheadActual),
      inclusions: ['allocatedOverheadOnProjects'],
      exclusions: [...fx, 'unallocatedBusinessCosts'],
    }),
    committed: moneyMetricFromSum({
      key: 'committedOpen',
      kind: 'committed',
      value: sumFieldOrNull(rows, currency, (r) => r.committedOpen),
      inclusions: ['openPurchaseOrderCommitments'],
      exclusions: [...fx, 'expenseActual', 'recognizedVendorBills'],
    }),
    expectedRemaining: moneyMetricFromSum({
      key: 'expectedRemainingCost',
      kind: 'estimate',
      value: sumFieldOrNull(rows, currency, (r) => r.expectedRemainingCost),
      inclusions: ['projectExpectedRemainingEtc'],
      exclusions: [...fx, 'committedPo', 'expenseActual'],
    }),
    openAp: moneyMetricFromSum({
      key: 'openApPayable',
      kind: 'forecast',
      value: sumFieldOrNull(rows, currency, (r) => r.openApPayable),
      inclusions: ['unmatchedOpenApBills'],
      exclusions: [...fx, 'expenseActual', 'committedPo'],
    }),
    estimatedFinal: moneyMetricFromSum({
      key: 'estimatedFinalCost',
      kind: 'estimate',
      value: sumFieldOrNull(rows, currency, (r) => r.estimatedFinalCost),
      inclusions: ['actualPlusRemainingCommitmentsPlusEtc'],
      exclusions: [...fx, 'openAp', 'vendorPayments', 'unallocatedBusinessCosts'],
    }),
    unallocatedBusinessCosts:
      unallocatedValue == null
        ? null
        : moneyMetric({
            key: 'unallocatedBusinessCosts',
            kind: 'actual',
            value: unallocatedValue,
            inclusions: ['finalizedOrgCostsAwaitingAllocation'],
            exclusions: [...fx, 'projectActualCost', 'projectProfit'],
          }),
  };
}

/** Profit margins from project rows. VAT never treated as profit. Unallocated org costs stay out. */
export function aggregateOrgProfit(
  rows: readonly ProjectRollupRow[],
  currency: string,
): OrgProfitTotals {
  const estimatedProfit = moneyMetricFromSum({
    key: 'estimatedProfit',
    kind: 'estimate',
    value: sumFieldOrNull(rows, currency, (r) => r.estimatedProfit),
    inclusions: ['currentContractMinusEstimatedFinal'],
    exclusions: [FX_EXCL, VAT_EXCL, 'incompleteCostCoverage', 'unallocatedBusinessCosts'],
  });

  const actualProfit = moneyMetricFromSum({
    key: 'actualProfit',
    kind: 'actual',
    value: sumFieldOrNull(rows, currency, (r) => r.actualProfit),
    inclusions: ['currentContractMinusActualCost'],
    exclusions: [FX_EXCL, VAT_EXCL, 'incompleteCostCoverage', 'unallocatedBusinessCosts'],
  });

  const withMargin = rows.find((row) => row.marginPercent != null);
  const withActualMargin = rows.find((row) => row.actualMarginPercent != null);
  return {
    estimatedProfit,
    actualProfit,
    sampleMarginPercent: withMargin?.marginPercent ?? null,
    sampleActualMarginPercent: withActualMargin?.actualMarginPercent ?? null,
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
