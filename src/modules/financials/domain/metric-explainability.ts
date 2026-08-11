import type {
  BillingPosition,
  CommercialPosition,
  CostPosition,
  MetricNature,
  ProfitPosition,
  ProjectFinancials,
} from '@/modules/financials/domain/types';
import { isZeroMoney, type MoneyValue } from '@/shared/money';
import type { DataConfidence } from './data-confidence';

/**
 * Explainability slices for major financial numbers ("Why this number?").
 *
 * Every category amount is taken from the ONE composed engine
 * (`composeProjectFinancials` → CostPosition / Commercial / Billing / Profit).
 * This module never invents Actual from Quote / Usage / Attendance / Recurrence.
 *
 * Formulas (must match domain comments on CostPosition / ProfitPosition):
 *
 *   Actual            = cost.actualCostToDate
 *                       (families + laborActual + vendorActual already folded in)
 *   Forecast          = Actual + committedOpen + expectedRemainingCost
 *   Current Contract  = original ± approved additions/reductions
 *   Actual Margin     = Current Contract − Actual
 *   Forecast Margin   = Current Contract − Forecast
 *   Unallocated Cost  = org disclosure remainder (not in project Actual)
 *   Outstanding AR    = billing.outstanding (invoiced − paid)
 *   Outstanding AP    = cost.openApPayable (cash obligation, not Actual)
 */

export type ExplainableMetricKey =
  | 'actual'
  | 'forecast'
  | 'current_contract'
  | 'actual_margin'
  | 'forecast_margin'
  | 'unallocated_cost'
  | 'outstanding_ar'
  | 'outstanding_ap';

export type ExplanationCategoryRole = 'add' | 'subtract' | 'info' | 'total';

export type ExplanationCategoryKey =
  | 'direct_project'
  | 'shared'
  | 'business_overhead'
  | 'asset_capital'
  | 'labor_actual'
  | 'vendor_actual'
  | 'overhead_actual'
  | 'committed_open'
  | 'expected_remaining'
  | 'original_contract'
  | 'approved_additions'
  | 'approved_reductions'
  | 'pending_changes'
  | 'current_contract'
  | 'actual_cost'
  | 'forecast_cost'
  | 'invoiced'
  | 'paid'
  | 'open_ap_payable'
  | 'unallocated_business'
  | 'actual_margin'
  | 'forecast_margin'
  | 'outstanding_ar';

export type ExplanationSourceKind =
  | 'expenses_finalized'
  | 'expenses_all'
  | 'project_expenses_tab'
  | 'project_changes_tab'
  | 'project_billing_tab'
  | 'billing_outstanding'
  | 'procurement_po'
  | 'procurement_ap'
  | 'expenses_overhead'
  | 'org_expenses';

export interface ExplanationCategoryLine {
  readonly key: ExplanationCategoryKey;
  readonly amount: MoneyValue;
  readonly role: ExplanationCategoryRole;
}

export interface ExplanationSourceRef {
  readonly kind: ExplanationSourceKind;
}

export interface MetricExplanation {
  readonly metric: ExplainableMetricKey;
  readonly total: MoneyValue;
  readonly nature: MetricNature | 'commercial' | 'disclosure';
  /** i18n key under financial.explain.formulas.* */
  readonly formulaKey: ExplainableMetricKey;
  readonly categories: readonly ExplanationCategoryLine[];
  readonly sources: readonly ExplanationSourceRef[];
  /** Permission gate that must pass to show this metric. */
  readonly requires:
    | 'project_financials'
    | 'contracts'
    | 'billing'
    | 'project_profit'
    | 'ap';
}

export interface ProjectFinancialExplainability {
  readonly metrics: readonly MetricExplanation[];
  readonly dataConfidence: DataConfidence;
}

function line(
  key: ExplanationCategoryKey,
  amount: MoneyValue,
  role: ExplanationCategoryRole,
): ExplanationCategoryLine {
  return { key, amount, role };
}

function buildActual(cost: CostPosition): MetricExplanation {
  return {
    metric: 'actual',
    total: cost.actualCostToDate,
    nature: 'actual',
    formulaKey: 'actual',
    categories: [
      line('direct_project', cost.byFamily.directProject, 'add'),
      line('shared', cost.byFamily.shared, 'add'),
      line('business_overhead', cost.byFamily.businessOverhead, 'add'),
      line('asset_capital', cost.byFamily.assetCapital, 'add'),
      line('labor_actual', cost.laborActual, 'info'),
      line('vendor_actual', cost.vendorActual, 'info'),
      line('overhead_actual', cost.overheadActual, 'info'),
      line('actual_cost', cost.actualCostToDate, 'total'),
    ],
    sources: [
      { kind: 'expenses_finalized' },
      { kind: 'project_expenses_tab' },
    ],
    requires: 'project_financials',
  };
}

function buildForecast(cost: CostPosition): MetricExplanation {
  return {
    metric: 'forecast',
    total: cost.estimatedFinalCost,
    nature: 'forecast',
    formulaKey: 'forecast',
    categories: [
      line('actual_cost', cost.actualCostToDate, 'add'),
      line('committed_open', cost.committedOpen, 'add'),
      line('expected_remaining', cost.expectedRemainingCost, 'add'),
      line('forecast_cost', cost.estimatedFinalCost, 'total'),
      line('open_ap_payable', cost.openApPayable, 'info'),
    ],
    sources: [
      { kind: 'expenses_all' },
      { kind: 'procurement_po' },
      { kind: 'procurement_ap' },
    ],
    requires: 'project_financials',
  };
}

function buildCurrentContract(commercial: CommercialPosition): MetricExplanation {
  return {
    metric: 'current_contract',
    total: commercial.currentContractValue,
    nature: 'commercial',
    formulaKey: 'current_contract',
    categories: [
      line('original_contract', commercial.originalContractValue, 'add'),
      line('approved_additions', commercial.approvedAdditions, 'add'),
      line('approved_reductions', commercial.approvedReductions, 'subtract'),
      line('current_contract', commercial.currentContractValue, 'total'),
      line('pending_changes', commercial.pendingChanges, 'info'),
    ],
    sources: [{ kind: 'project_changes_tab' }],
    requires: 'contracts',
  };
}

function buildActualMargin(
  commercial: CommercialPosition,
  cost: CostPosition,
  profit: ProfitPosition,
): MetricExplanation {
  return {
    metric: 'actual_margin',
    total: profit.actualProfit,
    nature: 'actual',
    formulaKey: 'actual_margin',
    categories: [
      line('current_contract', commercial.currentContractValue, 'add'),
      line('actual_cost', cost.actualCostToDate, 'subtract'),
      line('actual_margin', profit.actualProfit, 'total'),
    ],
    sources: [
      { kind: 'project_changes_tab' },
      { kind: 'expenses_finalized' },
    ],
    requires: 'project_profit',
  };
}

function buildForecastMargin(
  commercial: CommercialPosition,
  cost: CostPosition,
  profit: ProfitPosition,
): MetricExplanation {
  return {
    metric: 'forecast_margin',
    total: profit.estimatedProfit,
    nature: 'forecast',
    formulaKey: 'forecast_margin',
    categories: [
      line('current_contract', commercial.currentContractValue, 'add'),
      line('forecast_cost', cost.estimatedFinalCost, 'subtract'),
      line('forecast_margin', profit.estimatedProfit, 'total'),
    ],
    sources: [
      { kind: 'project_changes_tab' },
      { kind: 'expenses_all' },
      { kind: 'procurement_po' },
    ],
    requires: 'project_profit',
  };
}

function buildOutstandingAr(billing: BillingPosition): MetricExplanation {
  return {
    metric: 'outstanding_ar',
    total: billing.outstanding,
    nature: 'forecast',
    formulaKey: 'outstanding_ar',
    categories: [
      line('invoiced', billing.invoiced, 'add'),
      line('paid', billing.paid, 'subtract'),
      line('outstanding_ar', billing.outstanding, 'total'),
    ],
    sources: [
      { kind: 'project_billing_tab' },
      { kind: 'billing_outstanding' },
    ],
    requires: 'billing',
  };
}

function buildOutstandingAp(cost: CostPosition): MetricExplanation {
  return {
    metric: 'outstanding_ap',
    total: cost.openApPayable,
    nature: 'forecast',
    formulaKey: 'outstanding_ap',
    categories: [
      line('open_ap_payable', cost.openApPayable, 'total'),
      line('committed_open', cost.committedOpen, 'info'),
    ],
    sources: [
      { kind: 'procurement_ap' },
      { kind: 'procurement_po' },
    ],
    requires: 'ap',
  };
}

function buildUnallocated(unallocated: MoneyValue): MetricExplanation {
  return {
    metric: 'unallocated_cost',
    total: unallocated,
    nature: 'disclosure',
    formulaKey: 'unallocated_cost',
    categories: [line('unallocated_business', unallocated, 'total')],
    sources: [
      { kind: 'org_expenses' },
      { kind: 'expenses_overhead' },
    ],
    requires: 'project_financials',
  };
}

export interface BuildExplainabilityInput {
  readonly financials: Pick<
    ProjectFinancials,
    'commercial' | 'billing' | 'cost' | 'profit' | 'priceNotSet'
  >;
  readonly dataConfidence: DataConfidence;
  /** Org-layer disclosure; omit on project compose when unknown. */
  readonly unallocatedBusinessCosts?: MoneyValue | null;
  readonly canReadCommercial: boolean;
  readonly canReadBilling: boolean;
  readonly canReadProfit: boolean;
  readonly canReadAp?: boolean;
}

/**
 * Builds permission-filtered explanation packs from already-composed figures.
 */
export function buildProjectFinancialExplainability(
  input: BuildExplainabilityInput,
): ProjectFinancialExplainability {
  const { financials } = input;
  const metrics: MetricExplanation[] = [];

  metrics.push(buildActual(financials.cost));
  metrics.push(buildForecast(financials.cost));

  if (input.canReadCommercial && financials.commercial && !financials.priceNotSet) {
    metrics.push(buildCurrentContract(financials.commercial));
  }

  if (
    input.canReadProfit &&
    financials.commercial &&
    financials.profit &&
    !financials.priceNotSet
  ) {
    metrics.push(
      buildActualMargin(financials.commercial, financials.cost, financials.profit),
    );
    metrics.push(
      buildForecastMargin(financials.commercial, financials.cost, financials.profit),
    );
  }

  if (input.canReadBilling) {
    metrics.push(buildOutstandingAr(financials.billing));
  }

  if (input.canReadAp !== false) {
    metrics.push(buildOutstandingAp(financials.cost));
  }

  if (
    input.unallocatedBusinessCosts &&
    !isZeroMoney(input.unallocatedBusinessCosts) &&
    Number(input.unallocatedBusinessCosts.amount) > 0
  ) {
    metrics.push(buildUnallocated(input.unallocatedBusinessCosts));
  }

  return {
    metrics,
    dataConfidence: input.dataConfidence,
  };
}

export function findMetricExplanation(
  explainability: ProjectFinancialExplainability,
  metric: ExplainableMetricKey,
): MetricExplanation | null {
  return explainability.metrics.find((item) => item.metric === metric) ?? null;
}
