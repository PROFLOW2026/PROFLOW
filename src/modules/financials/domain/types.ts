import type { MoneyValue } from '@/shared/money/money';

/**
 * The financial contract every module reads from and none may redefine
 * (doc 04 §3, §10).
 *
 * The separations below are the product, not an implementation detail:
 * commercial value, billing, cash and cost are four different truths, and V1
 * must never collapse them into one "revenue" number. Any figure derived from
 * them travels with the coverage that produced it, so a partial picture cannot
 * be presented as a complete one.
 *
 * Lead-owned. Feature modules consume these types; the calculation lives in
 * `modules/financials/application`.
 */

/** Cost inputs a project may or may not have configured. */
export type CostSourceKey =
  | 'direct_expenses'
  | 'workforce'
  | 'allocated_overhead'
  | 'shared_costs'
  | 'subcontractor';

export interface CoverageEntry {
  source: CostSourceKey;
  /** True only when this organization has real data of this kind for the project. */
  included: boolean;
}

/**
 * Whether a figure counts only direct cost or also allocated overhead.
 * The two must never be silently mixed (doc 04 §10).
 */
export type CalculationBasis = 'direct_only' | 'fully_loaded';

/** Why a derived figure is incomplete rather than fully loaded. */
export type CoveragePartialReason =
  | 'foreign_currency_contracts_excluded'
  | 'foreign_currency_expenses_excluded'
  | 'foreign_currency_labor_excluded'
  | 'foreign_currency_billing_excluded'
  | 'workforce_entries_missing_cost';

export interface CoveragePartial {
  reason: CoveragePartialReason;
  count?: number;
}

export interface FinancialCoverage {
  basis: CalculationBasis;
  entries: CoverageEntry[];
  /** When the figures were derived, so a stale card can say so. */
  calculatedAt: Date;
  /** Present when rows were excluded from a sum — never fold them in silently. */
  partials?: readonly CoveragePartial[];
}

/** Commercial value: what was agreed, and what is still being negotiated. */
export interface CommercialPosition {
  originalContractValue: MoneyValue;
  approvedAdditions: MoneyValue;
  approvedReductions: MoneyValue;
  /** Original ± approved change orders. Change requests never move this. */
  currentContractValue: MoneyValue;
  /** Priced change requests not yet approved; shown separately, never added in. */
  pendingChanges: MoneyValue;
}

/** Billing and cash, kept apart from commercial value. */
export interface BillingPosition {
  invoiced: MoneyValue;
  paid: MoneyValue;
  outstanding: MoneyValue;
}

export interface CostPosition {
  actualCostToDate: MoneyValue;
  /** Actual plus whatever remaining cost the entered data supports. */
  estimatedFinalCost: MoneyValue;
  byFamily: {
    directProject: MoneyValue;
    shared: MoneyValue;
    businessOverhead: MoneyValue;
    assetCapital: MoneyValue;
  };
}

export interface ProfitPosition {
  /** currentContractValue − estimatedFinalCost, always labelled as an estimate. */
  estimatedProfit: MoneyValue;
  /** Null when the contract value is zero: a margin would be meaningless. */
  marginPercent: string | null;
}

export interface ProjectFinancials {
  projectId: string;
  currency: string;
  /** Null when the viewer lacks contracts.read — never substitute zeros. */
  commercial: CommercialPosition | null;
  billing: BillingPosition;
  cost: CostPosition;
  profit: ProfitPosition;
  coverage: FinancialCoverage;
}

/** Cross-project figures for the home dashboard. */
export interface OrganizationFinancials {
  currency: string;
  outstanding: MoneyValue;
  invoicedThisMonth: MoneyValue;
  costsThisMonth: MoneyValue;
  approvedNotBilled: MoneyValue;
  coverage: FinancialCoverage;
}

export function isCovered(coverage: FinancialCoverage, source: CostSourceKey): boolean {
  return coverage.entries.some((entry) => entry.source === source && entry.included);
}
