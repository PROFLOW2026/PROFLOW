import type { MoneyValue } from '@/shared/money/money';
import type { PricingMode, WorkKind } from './work-pricing';

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

export type { PricingMode, WorkKind } from './work-pricing';

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
  | 'foreign_currency_committed_excluded'
  | 'foreign_currency_ap_excluded'
  | 'workforce_entries_missing_cost'
  /** Mode B labor expenses omitted because Mode C time True Cost is present. */
  | 'labor_category_excluded_for_workforce';

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
  /**
   * Managed opening (engine) — `contracts.original_*` / original value event.
   * Profitability and KPI math use this path via current contract, never display original.
   */
  originalContractValue: MoneyValue;
  approvedAdditions: MoneyValue;
  approvedReductions: MoneyValue;
  /** Original ± approved change orders. Change requests never move this. */
  currentContractValue: MoneyValue;
  /** Priced change requests not yet approved; shown separately, never added in. */
  pendingChanges: MoneyValue;
  /**
   * Context only when an opening reduction exists. Real-world display original net.
   * Must not enter profitability, billing target, or forecast margin KPIs.
   */
  displayOriginalContractValue?: MoneyValue | null;
  /** Context only — opening reduction audit net. Never a payment / bill / expense. */
  openingReductionValue?: MoneyValue | null;
}

/** Billing and cash, kept apart from commercial value. */
export interface BillingPosition {
  invoiced: MoneyValue;
  paid: MoneyValue;
  outstanding: MoneyValue;
}

/**
 * How a money figure should be labelled in reports (docs 04, 29).
 * Committed ≠ Actual; Forecast ≠ Paid/Actual.
 */
export type MetricNature = 'actual' | 'committed' | 'forecast';

export interface CostPosition {
  /**
   * Actual — finalized expenses + labor + recognized (posted) vendor bills.
   * Never includes open committed PO. Bill-linked expenses are deduped.
   */
  actualCostToDate: MoneyValue;
  /**
   * Forecast Final Cost = Actual + Remaining Valid Commitments + Expected Remaining Cost.
   * Must diverge from actual whenever open commitments or ETC exist (no double count).
   */
  estimatedFinalCost: MoneyValue;
  byFamily: {
    directProject: MoneyValue;
    shared: MoneyValue;
    businessOverhead: MoneyValue;
    assetCapital: MoneyValue;
  };
  /** Actual — workforce labor cost when present; otherwise zero. */
  laborActual: MoneyValue;
  /**
   * Actual — vendor/subcontractor expenses + recognized vendor bills.
   * Never open PO committed amounts; never vendor payments.
   */
  vendorActual: MoneyValue;
  /** Actual — business overhead family total. */
  overheadActual: MoneyValue;
  /**
   * Committed — open / partially consumed PO remaining amounts.
   * Must never be summed into actualCostToDate (CommittedCost ≠ Expense).
   * Included in Forecast Final Cost once (as remaining commitment).
   */
  committedOpen: MoneyValue;
  /**
   * Uncovenanted expected remaining cost (ETC) entered on the project.
   * Does not include PO commitments. Included in Forecast Final Cost once.
   */
  expectedRemainingCost: MoneyValue;
  /**
   * Unmatched open AP payable for the project — cash obligation disclosure only.
   * Not folded into Forecast Final Cost (payments are cash-only).
   */
  openApPayable: MoneyValue;
}

export interface ProfitPosition {
  /**
   * Forecast margin: currentContractValue − estimatedFinalCost (Forecast Final Cost).
   * Kept as `estimatedProfit` for existing UI / exports; Agent 4 may relabel.
   */
  estimatedProfit: MoneyValue;
  /** Forecast margin % — null when contract value is zero. */
  marginPercent: string | null;
  /** Actual margin: currentContractValue − actualCostToDate. */
  actualProfit: MoneyValue;
  /** Actual margin % — null when contract value is zero. */
  actualMarginPercent: string | null;
}

export interface ProjectFinancials {
  projectId: string;
  currency: string;
  /** `project` | `job` — same financial engine; filterable at org level. */
  workKind: WorkKind;
  /**
   * Jobs: `fixed` | `open`. Classic projects: null (= fixed when contracted).
   */
  pricingMode: PricingMode;
  /**
   * No managed revenue basis yet: open-price job, or job without primary
   * contract. Costs/forecast OK; profit/margin not claimed.
   * UI should show price-not-set (Hebrew: המחיר טרם נקבע) — never fake −loss.
   */
  priceNotSet: boolean;
  /** Null when the viewer lacks contracts.read — never substitute zeros. */
  commercial: CommercialPosition | null;
  billing: BillingPosition;
  cost: CostPosition;
  /**
   * Null when the viewer lacks project_profit.read, commercial is hidden,
   * or `priceNotSet` (open-price — no revenue basis yet).
   * Never substitute zeros — that would look like break-even or fake loss.
   */
  profit: ProfitPosition | null;
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
